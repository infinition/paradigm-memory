# Memory eval report - 2026-04-29 - paraphrase-cases - lexical

Cases file: `evals/paraphrase-cases.json`
Variant: `lexical`

## Summary

- cases: 5
- node@1: 0.600
- node@3: 1.000
- item recall@k: 1.000
- avg context tokens: 640.6
- latency p50: 3.928 ms
- latency p95: 10.425 ms
- must-not violations: 0

## Cases

| id | node@1 | node@3 | recall | tokens | latency ms | violations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| paraphrase_memory_orientation | 0 | 1 | 1 | 663 | 10.425 | 0 |
| paraphrase_llm_backend | 1 | 1 | 1 | 718 | 3.928 | 0 |
| paraphrase_git | 1 | 1 | 1 | 527 | 5.315 | 0 |
| paraphrase_safety | 0 | 1 | n/a | 700 | 3.272 | 0 |
| paraphrase_web_ui | 1 | 1 | n/a | 595 | 3.696 | 0 |
