# MuttJobs

A Tauri v2 desktop app scaffolded with React 19, TypeScript, Vite, Tailwind CSS v4, and the complete shadcn/ui component registry.

## Development

```bash
npm run tauri dev
```

Build the desktop application with `npm run tauri build`, or build only the frontend with `npm run build`.

## Local Codex provider

MuttJobs includes a reusable local Codex provider foundation. Settings can
discover the user's authenticated `codex` CLI, validate its compatibility with
the pinned `@openai/codex-sdk`, and show worker health without reading or
persisting credentials. The SDK runs in a packaged Node sidecar supervised by
the Tauri backend; feature-specific Codex jobs can be added on top of that
boundary later.

`npm run build:worker` builds the platform worker sidecar, while
`npm run build:desktop` builds both the worker and the frontend.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
