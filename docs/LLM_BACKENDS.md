# Local LLM Backends

## Quick Position

We start with Ollama because it is already installed and simple to operate. We keep llama.cpp as the target backend for fine-grained control, benchmarking, and optimizations. Paradigm's code must be able to switch between the two without any identity migration.

The Ollama backend was validated locally on 2026-04-24 with `qwen3:0.6b`.

## Ollama

**Strengths:**
- Simple installation and model management.
- Local REST API.
- Excellent choice for getting started.
- Minimal daily friction.

**Limitations:**
- Additional abstraction layer.
- More indirect control over low-level parameters.
- Less transparent benchmarking.

## llama.cpp (Direct)

**Strengths:**
- Fine-grained control: GPU layers, batching, context size, cache, mmap, flash attention (depending on build).
- HTTP server with OpenAI-compatible routes.
- Strong candidate for measuring raw performance.

**Limitations:**
- Technical installation and compilation.
- Manual GGUF model management.
- Demanding tuning.

## Decision

Paradigm uses a standard adapter interface:
- **`mock`**: For development without a real backend.
- **`ollama`**: The primary real-world backend.
- **`llamacpp`**: For benchmarking and optimization.

Recommended model for general work: `qwen3:8b`.
Recommended model for quick smoke tests: `qwen3:0.6b`.

## Planned Benchmarks

Compare the following metrics using the same model or equivalent quantization:
- Latency (time to first token).
- Tokens per second.
- RAM/VRAM usage.
- Stability in long contexts.
- Subjective quality within the Paradigm prompt.
