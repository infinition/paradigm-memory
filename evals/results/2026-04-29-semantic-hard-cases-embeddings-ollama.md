# Memory eval report - 2026-04-29 - semantic-hard-cases - embeddings-ollama

Cases file: `evals/semantic-hard-cases.json`
Variant: `embeddings-ollama`

## Summary

- cases: 6
- node@1: 0.500
- node@3: 0.833
- item recall@k: 1.000
- avg context tokens: 627.7
- latency p50: 47.171 ms
- latency p95: 354.505 ms
- must-not violations: 0

## Cases

| id | node@1 | node@3 | recall | tokens | latency ms | violations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| semantic_git_versioning | 1 | 1 | 1 | 614 | 47.581 | 0 |
| semantic_memory_orientation | 0 | 1 | 1 | 615 | 83.889 | 0 |
| semantic_local_generator | 0 | 0 | 1 | 684 | 37.256 | 0 |
| semantic_safety_boundaries | 1 | 1 | n/a | 652 | 354.505 | 0 |
| semantic_experiment_design | 1 | 1 | n/a | 630 | 47.171 | 0 |
| semantic_chronological_witnesses | 0 | 1 | n/a | 571 | 33.167 | 0 |
