# MuttJobs agent worker

The worker is the Node-only boundary for `@openai/codex-sdk`. It is bundled
into a platform-specific Node Single Executable Application and launched by
the Rust provider supervisor, so the frontend never spawns a process and a
release build does not require a user-installed Node runtime.

```bash
npm run build:worker -- --bundle-only
npm run build:worker
```

The worker accepts newline-delimited JSON on stdin and writes protocol-only
JSON to stdout. Diagnostics go to stderr. The Rust side owns the exact local
Codex executable path and passes it through `codexPathOverride`.
