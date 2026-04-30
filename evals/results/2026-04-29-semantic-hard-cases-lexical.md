# Memory eval report - 2026-04-29 - semantic-hard-cases - lexical

Cases file: `evals/semantic-hard-cases.json`
Variant: `lexical`

## Summary

- cases: 6
- node@1: 0.333
- node@3: 0.833
- item recall@k: 1.000
- avg context tokens: 616.8
- latency p50: 3.634 ms
- latency p95: 9.865 ms
- must-not violations: 0

## Cases

| id | node@1 | node@3 | recall | tokens | latency ms | violations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| semantic_git_versioning | 0 | 0 | 1 | 658 | 9.865 | 0 |
| semantic_memory_orientation | 0 | 1 | 1 | 571 | 3.655 | 0 |
| semantic_local_generator | 1 | 1 | 1 | 682 | 4.260 | 0 |
| semantic_safety_boundaries | 0 | 1 | n/a | 594 | 3.476 | 0 |
| semantic_experiment_design | 1 | 1 | n/a | 596 | 3.294 | 0 |
| semantic_chronological_witnesses | 0 | 1 | n/a | 600 | 3.634 | 0 |
