# MuttJobs

MuttJobs is a private, local-first Windows desktop workspace for managing a job search from discovery through application. It combines job search and tracking with editable resumes, cover letters, company research, and optional AI assistance from tools already authenticated on your computer.

> [!IMPORTANT]
> MuttJobs is currently beta software. Back up important documents, review AI-generated edits before using them, and expect rough edges.

## Download the beta

Download the newest Windows installer from [GitHub Releases](https://github.com/Gohostieee/MuttJobs/releases/latest).

The first beta is distributed for 64-bit Windows. Because it is not yet code-signed, Windows may show a Microsoft Defender SmartScreen warning. Only install packages downloaded from this repository's Releases page.

## What it does

- Search for jobs with TheirStack, save reusable searches, and reveal selected job details.
- Track saved jobs on an Applications board from discovery through offer or rejection.
- Import, create, edit, target, and export resumes with templates, typography, colors, paper controls, and structured skills.
- Draft and edit job-specific cover letters.
- Run multi-part company research and keep its evidence with the saved job.
- Use a general application agent to inspect saved jobs and coordinate company research.
- Export and import a local backup of durable MuttJobs data.

MuttJobs stores application data locally. Provider credentials are not included in MuttJobs backups.

## Optional integrations

MuttJobs works as a document and application workspace without an AI provider. AI editing and research require at least one supported local provider:

- **Codex:** install the Codex CLI and authenticate it before selecting Codex in Settings.
- **Claude Code:** install Claude Code and run `claude auth login` before selecting it in Settings.

TheirStack job search requires your own TheirStack API key. Add it in Settings; revealing full job data may consume TheirStack credits. Search previews remain blurred until you explicitly save or reveal a result.

## Data and backups

Use **Settings → Data → Backups** to export a `.muttjobs-backup` file. Backups include durable jobs, application state, resumes, cover letters, profiles, research, saved searches, local agent skills, settings, and themes. They exclude provider credentials and temporary import data.

Backup files are not encrypted and can contain sensitive personal and job-search information. Store them accordingly.

## Development

Prerequisites:

- Node.js and npm
- Rust with the MSVC toolchain
- Tauri v2 system prerequisites for Windows

Install dependencies and run the desktop app:

```powershell
npm install
npm run tauri dev
```

Useful commands:

```powershell
npm run build
npm run build:worker
npm run tauri build
```

`npm run build:worker` packages the local provider worker sidecar. `npm run tauri build` builds the sidecar, frontend, Rust application, and Windows installers.

## Local Codex skills

Resume AI catalogs local Codex skills from the app-data workspace at `.agents/skills/<skill-name>/SKILL.md`. Type `#(` with Codex selected to discover a skill, then submit the mention. MuttJobs validates the local catalog and translates it to Codex's standard `$skill-name` prompt syntax. Skills are unavailable when Claude Code is selected.

## License

No open-source license has been granted yet. All rights are reserved.
