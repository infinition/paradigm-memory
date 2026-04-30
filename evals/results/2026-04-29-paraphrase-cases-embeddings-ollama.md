# Memory eval report - 2026-04-29 - paraphrase-cases - embeddings-ollama

Cases file: `evals/paraphrase-cases.json`
Variant: `embeddings-ollama`

## Summary

- cases: 5
- node@1: 0.600
- node@3: 1.000
- item recall@k: 1.000
- avg context tokens: 574.2
- latency p50: 36.184 ms
- latency p95: 46.486 ms
- must-not violations: 0

## Cases

| id | node@1 | node@3 | recall | tokens | latency ms | violations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| paraphrase_memory_orientation | 0 | 1 | 1 | 704 | 39.342 | 0 |
| paraphrase_llm_backend | 1 | 1 | 1 | 498 | 34.904 | 0 |
| paraphrase_git | 1 | 1 | 1 | 434 | 46.486 | 0 |
| paraphrase_safety | 0 | 1 | n/a | 650 | 36.184 | 0 |
| paraphrase_web_ui | 1 | 1 | n/a | 585 | 35.158 | 0 |
