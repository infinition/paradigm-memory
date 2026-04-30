# Memory eval report - 2026-04-30 - semantic-hard-cases - lexical

Cases file: `evals/semantic-hard-cases.json`
Variant: `lexical`

## Summary

- cases: 6
- node@1: 0.333
- node@3: 0.833
- item recall@k: 0.667
- avg context tokens: 610.2
- latency p50: 3.726 ms
- latency p95: 34.853 ms
- must-not violations: 0

## Cases

| id | node@1 | node@3 | recall | tokens | latency ms | violations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| semantic_git_versioning | 0 | 0 | 0 | 618 | 34.853 | 0 |
| semantic_memory_orientation | 0 | 1 | 1 | 571 | 5.088 | 0 |
| semantic_local_generator | 1 | 1 | 1 | 682 | 3.726 | 0 |
| semantic_safety_boundaries | 0 | 1 | n/a | 594 | 3.648 | 0 |
| semantic_experiment_design | 1 | 1 | n/a | 596 | 3.963 | 0 |
| semantic_chronological_witnesses | 0 | 1 | n/a | 600 | 2.602 | 0 |
