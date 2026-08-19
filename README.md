# MuttJobs

A Tauri v2 desktop app scaffolded with React 19, TypeScript, Vite, Tailwind CSS v4, and the complete shadcn/ui component registry.

## Development

```bash
npm run tauri dev
```

Build the desktop application with `npm run tauri build`, or build only the frontend with `npm run build`.

## Local agent providers

MuttJobs can use the local Codex CLI/SDK or Claude Code CLI to edit resume JSON
files. Provider settings discover each executable, check authentication, and
show worker health without reading or persisting credentials. The providers
run in a packaged Node sidecar supervised by the Tauri backend; the model
picker passes the selected provider, model, and effort into the job boundary.

Claude Code uses its non-interactive `--print` mode with structured JSON output
and a constrained read/edit/write tool set. Authenticate it with
`claude auth login` before selecting Claude Code in the model picker.

## Local Codex skills

Resume AI catalogs local Codex skills from the app-data workspace at
`.agents/skills/<skill-name>/SKILL.md`. The bundled `bazinga-test` fixture is
seeded on first catalog access without overwriting an existing runtime copy.
Type `#(` with Codex selected to discover a skill, then submit the mention;
MuttJobs validates the local catalog and translates it to Codex's normal
`$skill-name` prompt syntax. The skill body is loaded by Codex from the same
working directory and is never copied into the application prompt.

Local Codex skills are intentionally unavailable when Claude Code is selected.
Future skill authoring should use a separate workspace-write job rooted at the
managed skill directory, with network access disabled and changed paths
validated before the catalog is refreshed.

`npm run build:worker` builds the platform worker sidecar, while
`npm run build:desktop` builds both the worker and the frontend.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
