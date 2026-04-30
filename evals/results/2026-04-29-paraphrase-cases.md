# Memory eval report - 2026-04-29 - paraphrase-cases

Cases file: `evals/paraphrase-cases.json`

## Summary

- cases: 5
- node@1: 1.000
- node@3: 1.000
- item recall@k: 1.000
- avg context tokens: 582.4
- latency p50: 4.597 ms
- latency p95: 8.658 ms
- must-not violations: 0

## Cases

| id | node@1 | node@3 | recall | tokens | latency ms | violations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| paraphrase_memory_orientation | 1 | 1 | 1 | 663 | 8.658 | 0 |
| paraphrase_llm_backend | 1 | 1 | 1 | 513 | 5.411 | 0 |
| paraphrase_git | 1 | 1 | 1 | 527 | 4.597 | 0 |
| paraphrase_safety | 1 | 1 | n/a | 650 | 2.692 | 0 |
| paraphrase_web_ui | 1 | 1 | n/a | 559 | 3.785 | 0 |
