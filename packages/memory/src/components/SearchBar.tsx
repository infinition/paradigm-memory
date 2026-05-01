import { useState, useRef } from "react";
import { mcp } from "../lib/mcp";
import type { SearchResult } from "../lib/types";

interface Props {
  workspace?: string;
  onResult: (result: SearchResult | null) => void;
  onQueryChange?: (query: string) => void;
}

export function SearchBar({ workspace, onResult, onQueryChange }: Props) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ tokens: number; ms: number } | null>(null);
  const debounce = useRef<number | null>(null);

  const run = async (text: string) => {
    if (!text.trim()) {
      onResult(null);
      setMeta(null);
      return;
    }
    setBusy(true);
    try {
      const result = await mcp.search(text, workspace, 12);
      onResult(result);
      setMeta({ tokens: result.token_estimate ?? 0, ms: result.latency_ms ?? 0 });
    } catch (caught: any) {
      onResult(null);
      console.error(caught);
    } finally { setBusy(false); }
  };

  const onChange = (text: string) => {
    setQuery(text);
    onQueryChange?.(text);
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => run(text), 350);
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (debounce.current) window.clearTimeout(debounce.current);
    run(query);
  };

  const clear = () => {
    setQuery("");
    onResult(null);
    onQueryChange?.("");
    setMeta(null);
    if (debounce.current) {
      window.clearTimeout(debounce.current);
      debounce.current = null;
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      clear();
      (event.target as HTMLInputElement).blur();
    }
  };

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
      <span className="input-with-clear" style={{ flex: 1 }}>
        <input
          className="search-input"
          placeholder={'Search memory... (FTS5 boolean ops supported: AND, OR, NOT, +, -, "phrase")'}
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
        />
        {query && (
          <button type="button" className="clear-btn" onClick={clear} title="Clear (Esc)" tabIndex={-1}>×</button>
        )}
      </span>
      {busy && <span style={{ color: "var(--muted)", fontSize: 11 }}>…</span>}
      {meta && !busy && (
        <span style={{ color: "var(--muted)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
          {meta.tokens} tok · {meta.ms.toFixed(0)}ms
        </span>
      )}
    </form>
  );
}
