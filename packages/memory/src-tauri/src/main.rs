// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::State;
use tokio::sync::oneshot;

struct McpState {
    stdin: Mutex<ChildStdin>,
    child: Mutex<Child>,
    pending: Arc<Mutex<HashMap<i64, oneshot::Sender<Value>>>>,
    next_id: Mutex<i64>,
    memory_dir: PathBuf,
    command: String,
    args: Vec<String>,
}

impl McpState {
    fn next_id(&self) -> i64 {
        let mut id = self.next_id.lock().unwrap();
        *id += 1;
        *id
    }

    async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id();
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);

        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let payload = format!("{}\n", req);

        {
            let mut stdin = self.stdin.lock().unwrap();
            stdin
                .write_all(payload.as_bytes())
                .map_err(|err| format!("write to mcp stdin: {}", err))?;
            stdin
                .flush()
                .map_err(|err| format!("flush mcp stdin: {}", err))?;
        }

        let resp = rx
            .await
            .map_err(|err| format!("mcp response channel: {}", err))?;
        if let Some(error) = resp.get("error") {
            return Err(error.to_string());
        }
        Ok(resp.get("result").cloned().unwrap_or(Value::Null))
    }
}

impl Drop for McpState {
    fn drop(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[tauri::command]
async fn mcp_call(
    state: State<'_, McpState>,
    method: String,
    params: Value,
) -> Result<Value, String> {
    state.call(&method, params).await
}

#[derive(serde::Serialize)]
struct McpRuntimeStatus {
    memory_dir: String,
    command: String,
    args: Vec<String>,
}

#[tauri::command]
async fn mcp_status(state: State<'_, McpState>) -> Result<McpRuntimeStatus, String> {
    Ok(McpRuntimeStatus {
        memory_dir: state.memory_dir.to_string_lossy().to_string(),
        command: state.command.clone(),
        args: state.args.clone(),
    })
}

#[derive(serde::Serialize)]
struct MutationRow {
    id: String,
    at: String,
    operation: String,
    item_id: Option<String>,
    node_id: Option<String>,
    reason: Option<String>,
    actor: Option<String>,
}

#[tauri::command]
async fn read_mutations(
    state: State<'_, McpState>,
    workspace: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<MutationRow>, String> {
    let mut path = state.memory_dir.clone();
    if let Some(ws) = workspace {
        path.push("workspaces");
        path.push(ws);
    }
    path.push("memory");
    path.push("paradigm.sqlite");

    let conn = rusqlite::Connection::open(&path)
        .map_err(|err| format!("open sqlite at {:?}: {}", path, err))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, at, operation, item_id, node_id, reason, actor \
             FROM memory_mutations \
             ORDER BY at DESC \
             LIMIT ?1",
        )
        .map_err(|err| err.to_string())?;
    let limit = limit.unwrap_or(200);
    let rows = stmt
        .query_map([limit], |row| {
            Ok(MutationRow {
                id: row.get(0)?,
                at: row.get(1)?,
                operation: row.get(2)?,
                item_id: row.get(3)?,
                node_id: row.get(4)?,
                reason: row.get(5)?,
                actor: row.get(6)?,
            })
        })
        .map_err(|err| err.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|err| err.to_string())?);
    }
    Ok(out)
}

fn resolve_memory_dir() -> PathBuf {
    if let Ok(custom) = env::var("PARADIGM_MEMORY_DIR") {
        return PathBuf::from(custom);
    }
    if let Some(home) = dirs::home_dir() {
        return home.join(".paradigm");
    }
    PathBuf::from(".paradigm")
}

fn bundled_binary_names() -> Vec<String> {
    if cfg!(windows) {
        vec![
            "paradigm-memory-mcp.exe".to_string(),
            "paradigm-memory-mcp".to_string(),
        ]
    } else {
        vec!["paradigm-memory-mcp".to_string()]
    }
}

fn resolve_mcp_candidates() -> Vec<(String, Vec<String>)> {
    let mut candidates = Vec::new();
    if let Ok(cmd) = env::var("PARADIGM_MCP_COMMAND") {
        let mut parts = cmd.split_whitespace();
        let exe = parts.next().unwrap_or("node").to_string();
        let args: Vec<String> = parts.map(String::from).collect();
        candidates.push((exe, args));
        return candidates;
    }

    if let Ok(server) = env::var("PARADIGM_MCP_SERVER") {
        candidates.push(("node".to_string(), vec![server]));
    }

    let paradigm_home = env::var("PARADIGM_HOME")
        .map(PathBuf::from)
        .ok()
        .or_else(|| dirs::home_dir().map(|home| home.join(".paradigm")));
    if let Some(home) = paradigm_home {
        let installed_server = home.join("app").join("current").join("packages").join("memory-mcp").join("src").join("server.mjs");
        if installed_server.exists() {
            candidates.push(("node".to_string(), vec![installed_server.to_string_lossy().to_string()]));
        }
    }

    let mut server = None;
    let mut here = env::current_exe().ok().and_then(|exe| exe.parent().map(PathBuf::from));
    if here.is_none() {
        here = env::current_dir().ok();
    }
    if let Some(mut path) = here {
        for name in bundled_binary_names() {
            let direct = path.join(&name);
            if direct.exists() {
                candidates.push((direct.to_string_lossy().to_string(), Vec::new()));
            }
            let resource = path.join("resources").join(&name);
            if resource.exists() {
                candidates.push((resource.to_string_lossy().to_string(), Vec::new()));
            }
        }

        for _ in 0..6 {
            let candidate = path.join("packages/memory-mcp/src/server.mjs");
            if candidate.exists() {
                server = Some(candidate);
                break;
            }
            if !path.pop() {
                break;
            }
        }
    }
    if let Some(server) = server {
        candidates.push(("node".to_string(), vec![server.to_string_lossy().to_string()]));
    }

    candidates.push(("paradigm-memory-mcp".to_string(), Vec::new()));
    candidates.push((
        "node".to_string(),
        vec!["./packages/memory-mcp/src/server.mjs".to_string()],
    ));
    candidates
}

fn spawn_mcp(memory_dir: &PathBuf) -> Result<McpState, String> {
    let mut last_error = String::new();
    let mut selected: Option<(String, Vec<String>, Child)> = None;
    let mut tried: Vec<String> = Vec::new();
    for (cmd, args) in resolve_mcp_candidates() {
        tried.push(format!("{} {}", cmd, args.join(" ")));
        match Command::new(&cmd)
            .args(&args)
            .env("PARADIGM_MEMORY_DIR", memory_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
        {
            Ok(child) => {
                selected = Some((cmd, args, child));
                break;
            }
            Err(err) => {
                last_error = format!("{} {}: {}", cmd, args.join(" "), err);
            }
        }
    }
    let (cmd, args, mut child) = match selected {
        Some(triple) => triple,
        None => {
            return Err(format!(
                "Could not spawn the paradigm-memory MCP sidecar.\n\
                 Tried (in order):\n  - {}\n\
                 Last error: {}\n\
                 Hint: install the CLI from GitHub Releases with the official installer,\n\
                 or run Paradigm Memory from a source checkout (npm run app:dev).",
                tried.join("\n  - "),
                if last_error.is_empty() { "no candidate produced an error".to_string() } else { last_error }
            ));
        }
    };

    let stdin = child.stdin.take().ok_or_else(|| "mcp stdin unavailable".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "mcp stdout unavailable".to_string())?;

    let pending = Arc::new(Mutex::new(HashMap::new()));
    let pending_for_thread = Arc::clone(&pending);

    let state = McpState {
        stdin: Mutex::new(stdin),
        child: Mutex::new(child),
        pending,
        next_id: Mutex::new(0),
        memory_dir: memory_dir.clone(),
        command: cmd,
        args,
    };

    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { continue };
            if line.trim().is_empty() {
                continue;
            }
            let Ok(message) = serde_json::from_str::<Value>(&line) else {
                eprintln!("[mcp] malformed line: {}", line);
                continue;
            };
            if let Some(id) = message.get("id").and_then(Value::as_i64) {
                if let Some(tx) = pending_for_thread.lock().unwrap().remove(&id) {
                    let _ = tx.send(message);
                }
            }
        }
    });

    Ok(state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let memory_dir = resolve_memory_dir();
    let mcp = match spawn_mcp(&memory_dir) {
        Ok(state) => state,
        Err(message) => {
            // Log to stderr (visible if launched from a terminal) and pop a
            // native message box so users running the GUI see the failure
            // instead of a silent crash.
            eprintln!("[paradigm-memory] {}", message);
            #[cfg(target_os = "windows")]
            {
                use std::ffi::OsStr;
                use std::iter::once;
                use std::os::windows::ffi::OsStrExt;
                extern "system" {
                    fn MessageBoxW(hwnd: *const std::ffi::c_void, text: *const u16, caption: *const u16, ty: u32) -> i32;
                }
                let to_wide = |s: &str| OsStr::new(s).encode_wide().chain(once(0)).collect::<Vec<u16>>();
                let text = to_wide(&message);
                let caption = to_wide("Paradigm Memory");
                unsafe { MessageBoxW(std::ptr::null(), text.as_ptr(), caption.as_ptr(), 0x10); }
            }
            std::process::exit(1);
        }
    };

    if let Err(err) = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(mcp)
        .invoke_handler(tauri::generate_handler![mcp_call, mcp_status, read_mutations])
        .run(tauri::generate_context!())
    {
        eprintln!("[paradigm-memory] tauri runtime error: {}", err);
        std::process::exit(1);
    }
}

fn main() {
    run();
}
