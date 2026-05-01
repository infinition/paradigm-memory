# Contributing to paradigm-memory

Thanks for taking a look. This project is small and opinionated — please skim
this file before sending a PR.

## What we want

- Bug reports with reproducible repros (versions, OS, exact MCP client).
- PRs that add clear value: new embedding providers, better consolidation
  heuristics, additional MCP client recipes, performance improvements with
  benchmarks.
- Eval cases that exhibit failure modes of the activation pipeline.

## What we do not want

- Cosmetic refactors without behaviour change.
- New dependencies without justification.
- Tool additions without tests and audit-log coverage.

## Local setup

```bash
git clone https://github.com/infinition/paradigm-memory.git
cd paradigm-memory
npm install
npm run lint
npm test
npm run eval:memory                       # lexical baseline, no embeddings
PARADIGM_MEMORY_EMBEDDINGS=wasm npm run eval:memory   # WASM embeddings
```

## Style

- ESM only. Node 22+. No TypeScript transpile step.
- 2-space indent. Single quotes are fine if you keep them consistent in a file.
- Audit invariant: any mutation MUST produce a `memory_mutations` row.
- Status invariant: search/retrieval MUST exclude items where `status != 'active'`
  or `deleted_at IS NOT NULL`.

## Commit messages

`type(scope): subject` — types we use: `feat`, `fix`, `perf`, `docs`, `test`,
`chore`, `refactor`. Scope is optional but appreciated.

## Releasing

Tag `v*.*.*`, GitHub Actions runs the matrix. After green:

```bash
npm publish --workspace @paradigm-memory/memory-core --access public
npm publish --workspace @paradigm-memory/memory-mcp  --access public
```
