# MuttJobs agent worker

The worker is the Node-only boundary for the Codex SDK and Claude Code CLI. It
is bundled into a platform-specific Node Single Executable Application and
launched by the Rust provider supervisor, so the frontend never spawns a
process and a release build does not require a user-installed Node runtime.

```bash
npm run build:worker -- --bundle-only
npm run build:worker
```

The worker accepts newline-delimited JSON on stdin and writes protocol-only
JSON to stdout. Diagnostics go to stderr. The Rust side owns the exact local
provider executable paths and passes them to the worker during initialization.

Codex skill discovery remains native to the SDK: the Rust job layer supplies
the app-data resumes directory as `workingDirectory`, and the worker sends the
validated ordinary prompt string to `startThread(...).runStreamed(...)`. The
worker does not watch, parse, or inject `SKILL.md` files, and Claude Code does
not participate in the Codex skill catalog.
