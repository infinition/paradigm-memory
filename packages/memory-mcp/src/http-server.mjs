#!/usr/bin/env node
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callTool, protocolVersion, readPackageMeta, textContent, toolDefinitions } from "./server.mjs";
import { createMemoryService, memoryServiceError } from "./memory-service.mjs";

const __filename = fileURLToPath(import.meta.url);

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": process.env.PARADIGM_HTTP_CORS_ORIGIN ?? "null",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, OPTIONS"
  });
  res.end(body);
}

function jsonRpcResult(id, payload) {
  return { jsonrpc: "2.0", id, result: payload };
}

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data ? { data } : {}) }
  };
}

async function readBody(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Request body too large");
      error.code = "body_too_large";
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function authorized(req, host) {
  const token = process.env.PARADIGM_HTTP_TOKEN;
  const isLoopback = ["127.0.0.1", "localhost", "::1"].includes(host);
  if (!isLoopback && !token) return false;
  if (!token) return true;
  return req.headers.authorization === `Bearer ${token}`;
}

async function handleRpc(service, meta, message) {
  if (!message || message.jsonrpc !== "2.0") {
    return jsonRpcError(message?.id ?? null, -32600, "Invalid Request");
  }
  const { id, method, params } = message;
  try {
    if (method === "initialize") {
      return jsonRpcResult(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "paradigm-memory", version: meta.version }
      });
    }
    if (method === "ping") return jsonRpcResult(id, {});
    if (method === "tools/list") return jsonRpcResult(id, { tools: toolDefinitions });
    if (method === "tools/call") {
      const payload = await callTool(service, params?.name, params?.arguments ?? {});
      return jsonRpcResult(id, textContent(payload));
    }
    return jsonRpcError(id, -32601, `Method not found: ${method}`);
  } catch (caught) {
    const normalized = memoryServiceError(caught);
    return jsonRpcError(id, -32000, normalized.message, normalized);
  }
}

export async function startHttpServer({
  host = arg("--host", process.env.PARADIGM_HTTP_HOST ?? "127.0.0.1"),
  port = Number(arg("--port", process.env.PARADIGM_HTTP_PORT ?? "8765"))
} = {}) {
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && !process.env.PARADIGM_HTTP_TOKEN) {
    throw new Error("Refusing non-loopback HTTP bind without PARADIGM_HTTP_TOKEN");
  }

  const meta = await readPackageMeta();
  const service = await createMemoryService({
    packageMeta: meta,
    protocolVersion,
    toolCount: toolDefinitions.length
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") return json(res, 204, {});
      if (!authorized(req, host)) return json(res, 401, { error: "unauthorized" });

      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);
      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, { ok: true, name: "paradigm-memory", version: meta.version });
      }
      if (req.method === "GET" && url.pathname === "/api/version") {
        const workspace = url.searchParams.get("workspace") ?? undefined;
        return json(res, 200, await service.version({ workspace }));
      }
      if (req.method === "GET" && url.pathname === "/api/tools") {
        return json(res, 200, { tools: toolDefinitions });
      }
      if (req.method === "GET" && url.pathname === "/sse") {
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          "connection": "keep-alive"
        });
        res.write(`event: endpoint\ndata: ${JSON.stringify({ endpoint: "/mcp", protocolVersion })}\n\n`);
        const timer = setInterval(() => res.write(`event: ping\ndata: {}\n\n`), 15000);
        req.on("close", () => clearInterval(timer));
        return;
      }
      if (req.method === "POST" && url.pathname === "/mcp") {
        const body = await readBody(req);
        const payload = JSON.parse(body);
        const response = Array.isArray(payload)
          ? await Promise.all(payload.map((message) => handleRpc(service, meta, message)))
          : await handleRpc(service, meta, payload);
        return json(res, 200, response);
      }

      return json(res, 404, { error: "not_found" });
    } catch (caught) {
      return json(res, caught.code === "body_too_large" ? 413 : 500, {
        error: caught.code ?? "http_error",
        message: caught.message
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const close = () => {
    service.close();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);

  return { server, service, host, port, meta };
}

if (path.resolve(process.argv[1] ?? "") === __filename) {
  startHttpServer().then(({ host, port, meta }) => {
    process.stderr.write(`${meta.name} HTTP bridge listening on http://${host}:${port}\n`);
  }).catch((caught) => {
    process.stderr.write(`paradigm-memory HTTP failed: ${caught.stack ?? caught.message}\n`);
    process.exit(1);
  });
}
