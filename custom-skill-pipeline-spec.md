# MuttJobs Custom Skill Pipeline Specification

Status: implementation-ready proposal  
Scope: local Codex skill discovery, UI mentions, invocation, authoring foundation, and one test fixture  
Out of scope: production resume skills, Codex App Server migration, and the resume patch/diff system

## 1. Purpose

Add ordinary local Codex skills to the existing MuttJobs agent pipeline without replacing or redesigning that pipeline.

The implementation must:

- Keep the existing React -> Tauri -> packaged Node worker -> Codex SDK execution path.
- Keep the current short-lived worker lifecycle, streamed events, cancellation, output schemas, model selection, reasoning effort, and sandbox configuration.
- Store skills as normal `.agents/skills/<skill-name>/SKILL.md` directories beneath the Codex working directory.
- Let Codex perform its normal skill discovery and progressive instruction loading.
- Let users explicitly invoke a skill in MuttJobs with `#(skill-name)`.
- Translate that UI syntax into Codex's normal `$skill-name` prompt syntax.
- Install exactly one initial test skill, `bazinga-test`.

Do not implement Improve Bullets, Quantify Impact, Job Match, grading, ATS, seniority, or any other resume skill in this work.

## 2. Non-negotiable architecture constraint

This feature is an extension of the current prompt pipeline, not a new agent runtime.

Keep this architecture:

```text
React Resume AI sidebar
  src/components/resume-ai-sidebar.tsx
        |
        | invoke run_resume_ai_job
        v
Tauri backend
  src/lib/resume-ai.ts
  src-tauri/src/lib.rs
  src-tauri/src/providers/mod.rs
  src-tauri/src/providers/job.rs
        |
        | existing JSONL worker protocol
        v
Packaged Node worker
  agent-worker/src/main.ts
  agent-worker/src/codex-provider.ts
        |
        | existing @openai/codex-sdk runStreamed call
        v
Codex CLI/runtime
```

Specifically, do not:

- Replace `@openai/codex-sdk` with Codex App Server.
- Add a second Codex execution path for skill-aware jobs.
- Make the Node worker persistent solely for skill file watching.
- Add structured App Server `type: "skill"` input.
- Inject full `SKILL.md` contents into application prompts.
- Spawn Codex from React or feature-specific Rust code.
- Change Claude Code execution.

The current SDK starts Codex with a `workingDirectory`. Codex is responsible for discovering skills visible from that directory. MuttJobs only adds a local catalog for its UI and rewrites an explicit mention into Codex's documented prompt syntax.

## 3. User-visible outcome

After implementation, a user can open Resume AI with Codex selected and type:

```text
#(bazinga-test) Explain what MuttJobs does in two short sentences.
```

The UI resolves `bazinga-test` from the local catalog and submits this effective prompt through the existing job path:

```text
$bazinga-test Explain what MuttJobs does in two short sentences.
```

Codex discovers and loads the corresponding `SKILL.md`. The final response should resemble:

```text
MuttJobs helps you edit a structured resume with local AI assistance Bazinga!
It keeps your resume available in a desktop workspace Bazinga!
```

The behavior must come from the skill file. MuttJobs must not append `Bazinga!` in application code or add the Bazinga instruction to its generic prompt.

## 4. Official Codex behavior this design relies on

OpenAI documents that:

- A skill is a directory containing a `SKILL.md` file and optional resources or scripts.
- `SKILL.md` requires `name` and `description` frontmatter.
- Codex initially receives skill name, description, and path.
- Codex loads the full instructions when it chooses or is asked to use a skill.
- A skill may be invoked explicitly in Codex CLI/IDE prompt text with `$skill-name`.
- Codex discovers repository skills beneath `.agents/skills` based on its current working directory and repository hierarchy.
- Codex detects skill file changes automatically, with restart as a fallback when a change does not appear.

References:

- <https://developers.openai.com/plugins/build/skills>
- <https://github.com/openai/codex/tree/main/sdk/typescript>

The implementation should verify this behavior against the installed Codex version. If the installed runtime cannot discover a valid skill from the configured working directory, stop and report that compatibility problem rather than introducing App Server as an unplanned workaround.

## 5. Current repository facts

Verify these facts before editing because the repository may have changed:

- Resume files are stored directly in Tauri's application-data `resumes` directory.
- `src-tauri/src/providers/mod.rs` currently sets a resume job's root to the target JSON file's parent directory.
- That root crosses the worker protocol as `workingDirectory`.
- `agent-worker/src/codex-provider.ts` passes `workingDirectory` into `codex.startThread(...)`.
- The current worker protocol is version `3` and build `provider-foundation-3` when this spec was written.
- `src/components/resume-ai-sidebar.tsx` owns the prompt textarea and submission flow.
- `src/lib/resume-ai.ts` invokes the Tauri job and listens for streamed events.

The skill feature should require no worker protocol bump unless implementation discovers a concrete need unrelated to skill discovery or invocation. Adding `$skill-name` to the prompt does not require a protocol change.

## 6. Runtime skill layout

Use the existing Codex working directory as the skill workspace:

```text
<appData>/resumes/
  .agents/
    skills/
      bazinga-test/
        SKILL.md
      <future-user-skill>/
        SKILL.md
        references/
        scripts/
        assets/
  resume-one.json
  resume-two.json
```

Define these paths in one Tauri helper:

```text
agentWorkspaceRoot = <appData>/resumes
agentSkillsRoot    = <appData>/resumes/.agents/skills
```

Requirements:

- Create `.agents/skills` when missing.
- Canonicalize and validate paths before reading or writing.
- Prevent path traversal and symlink escape from `agentSkillsRoot`.
- Continue enumerating only direct `.json` files as resumes.
- Keep `skipGitRepoCheck` enabled because this app-data workspace is not expected to be a Git repository.
- Confirm with an integration test that Codex launched with `workingDirectory = agentWorkspaceRoot` discovers the test skill.

## 7. Bundled test skill

The repository must contain one bundled default skill:

```text
src-tauri/resources/default-skills/bazinga-test/SKILL.md
```

Include the default-skill resource in the desktop bundle. Before the first skill catalog read, copy it to the runtime skill root only when the destination does not already exist.

Never overwrite an existing runtime skill. A user may intentionally edit it.

Use this fixture:

```md
---
name: bazinga-test
description: Test MuttJobs skill discovery and explicit invocation by ending every natural-language sentence the agent writes with Bazinga. Use only when explicitly invoked.
---

This is a pipeline verification skill.

End every natural-language sentence you write with the exact text `Bazinga!`, including visible progress, analysis, and the final user-facing response.

The word `Bazinga!` must be the final text of each sentence. Do not place another sentence-ending character after it.

Do not modify any files. Do not claim that you modified the resume. Follow the user's requested content and length except for the required sentence ending.
```

The application must not contain the fixture's behavioral instruction anywhere except this skill resource and tests that assert the expected outcome.

## 8. MuttJobs skill catalog

### 8.1 Why MuttJobs needs a catalog

Codex already discovers skills for the model. MuttJobs separately needs enough metadata to:

- Populate `#(` autocomplete.
- Validate explicit user mentions before starting a job.
- Display skill names and descriptions.
- Prevent chat text from supplying arbitrary file paths.

This UI catalog does not replace Codex discovery and is not sent to the model as a duplicate skills list.

### 8.2 Catalog scope

For the first version, catalog only locally managed skills under:

```text
<appData>/resumes/.agents/skills/*/SKILL.md
```

Do not attempt to mirror every user, admin, system, or plugin skill known to the user's separate Codex installation. Those scopes can be considered later if MuttJobs needs to expose them in its UI.

### 8.3 Catalog parsing

Add a read-only Tauri command that scans immediate child directories of `agentSkillsRoot` and parses `SKILL.md` YAML frontmatter.

Return:

```ts
export type AgentSkill = {
  name: string
  description: string
  path: string
  enabled: boolean
}

export type AgentSkillCatalog = {
  skills: AgentSkill[]
  errors: Array<{ path?: string; message: string }>
}
```

Rules:

- Require valid UTF-8.
- Require closed YAML frontmatter at the beginning of the file.
- Require non-empty string `name` and `description`.
- Require the supported name grammar.
- Canonicalize the `SKILL.md` path and confirm it stays beneath `agentSkillsRoot`.
- Return valid skills even when another local skill is malformed.
- Sort by name for deterministic UI behavior.
- Treat local skills as enabled in v1; do not invent a second enable/disable configuration system.

Use a real YAML parser rather than an ad hoc colon-splitting parser.

### 8.4 Refresh behavior

The worker does not need to watch skill files.

- Load the catalog when Resume AI opens.
- Refresh when the sidebar is reopened.
- Provide an explicit refresh action when useful.
- Refresh after a skill-authoring operation completes.
- Refresh and retry validation once when a selected skill is missing at submission time.

This is sufficient for local project skills and preserves the current short-lived worker model.

## 9. Explicit mention syntax

The MuttJobs user-facing syntax is:

```text
#(skill-name)
```

Initial skill-name grammar:

```regex
[a-z0-9]+(?:-[a-z0-9]+)*
```

The parser must:

- Find complete mentions without changing ordinary `#hashtags`.
- Preserve surrounding text.
- Resolve each name against the current local catalog.
- Deduplicate repeated mentions.
- Reject unknown or malformed mentions before starting the job.
- Never accept a path from chat text.
- Support more than one distinct skill mention, even though the fixture only tests one.

Example transformation:

```text
Before:
#(bazinga-test) Explain this app in two sentences.

After:
$bazinga-test Explain this app in two sentences.
```

Only replace resolved `#(name)` mentions. Do not change other prompt content.

## 10. Invocation through the existing pipeline

### 10.1 Frontend submission

At submission:

1. Parse skill mentions from the user's visible text.
2. Resolve them against the catalog.
3. Preserve the original `#(name)` form in the displayed user message.
4. Produce an effective prompt with resolved mentions changed to `$name`.
5. Send that effective prompt through the existing `runResumeAiJob(...)` function.

No full skill body, path, or description needs to cross the worker protocol.

### 10.2 Backend defense

Do not rely solely on frontend validation.

Prefer passing a small list of resolved skill names alongside the prompt to the Tauri command, or have Tauri parse the original syntax before transformation. Tauri should verify each referenced name against its own fresh local catalog.

After validation, Tauri may construct the effective `$name` prompt. This is preferable to trusting a frontend-generated `$name` string because it keeps mention resolution authoritative at the filesystem boundary.

This extra Tauri argument does not need to cross the worker boundary. The worker still receives an ordinary string prompt in the existing `AgentJobRequest`.

### 10.3 Codex execution

The existing Codex runner should remain structurally unchanged:

```ts
const thread = codex.startThread({
  workingDirectory: job.workingDirectory,
  // existing sandbox, model, reasoning, and other options
})

await thread.runStreamed(job.prompt, {
  outputSchema: job.outputSchema,
  signal: controller.signal,
})
```

Codex sees `$bazinga-test` in the prompt, discovers `.agents/skills/bazinga-test/SKILL.md` from the same working directory, and loads it using its normal skill mechanism.

If that does not happen with the installed Codex runtime, capture the exact runtime/version/error and stop. Do not silently paste `SKILL.md` into the prompt because that would make the acceptance test meaningless.

### 10.4 Implicit invocation

Codex may still consider local skill descriptions when no explicit mention is present. The `bazinga-test` description and body explicitly say it should only run when invoked, so normal prompts must not activate it.

## 11. Frontend UX

Extend `src/components/resume-ai-sidebar.tsx` without replacing its existing composer.

### 11.1 Autocomplete

- Typing `#(` opens a filtered skill picker.
- Match against skill name and description.
- Up/Down changes selection.
- Enter or Tab inserts the selection.
- Escape closes the picker.
- Insert `#(name)` at the current textarea caret.
- Continue using the current textarea; a contenteditable token editor is not required.

### 11.2 Provider behavior

- Show local Codex skills only while Codex is selected.
- When Claude Code is selected, do not offer Codex skill autocomplete.
- If the user inserts a skill mention and then switches to Claude Code, preserve the draft but block submission with: `Local Codex skills require the Codex provider.`
- Do not change the existing provider/model/effort picker behavior.

### 11.3 Conversation rendering

- Display the user's original `#(name)` text, not the internal `$name` prompt.
- Optionally show a small skill badge.
- Keep existing streamed trace and final response rendering.
- Catalog errors should not disable ordinary skill-free chat.

## 12. Tauri API

Add a command conceptually equivalent to:

```rust
#[tauri::command]
fn list_agent_skills(app: AppHandle) -> Result<AgentSkillCatalog, String>
```

Extend the resume AI request with original user text and/or explicit skill names in a way that lets Tauri validate mentions and construct the final prompt.

One acceptable shape is:

```rust
async fn run_resume_ai_job(
    app: AppHandle,
    path: String,
    prompt: String,
    skills: Option<Vec<String>>,
    // existing provider/model/effort/job fields
)
```

Requirements:

- The backend loads its own catalog.
- Every requested skill name must match exactly one local entry.
- The backend canonicalizes and validates the entry path.
- Skill names become `$name` prompt mentions only after validation.
- The worker still receives the existing string `prompt` field.
- Do not weaken resume path validation.

If the frontend sends an already transformed prompt, also send the original mention list so the backend can verify it. Prefer a design where the backend performs the final transformation once.

## 13. Skill authoring foundation

The pipeline should permit future chat-driven skill creation without changing normal execution permissions.

This specification does not require a full skill-management UI, but implementation should add or preserve a clean boundary for a later `create_skill`/`edit_skill` job:

```text
Explicit authoring request
  -> separate job kind
  -> workingDirectory = agentSkillsRoot
  -> workspace-write sandbox
  -> network disabled
  -> validate changed files remain under agentSkillsRoot
  -> refresh local catalog
```

Normal skill execution remains on the existing resume job permissions. The `bazinga-test` skill itself instructs Codex not to write files.

Do not make every skill invocation writable merely because some future skill may author files.

When chat-driven authoring is implemented, invoke the normal Codex `skill-creator` workflow with the existing SDK prompt mechanism and a workspace restricted to `agentSkillsRoot`. It does not require App Server.

## 14. Claude Code boundary

Claude Code is not part of the native skill implementation.

- Do not inject Codex `SKILL.md` files into Claude prompts and call it equivalent.
- Do not show local Codex skills as invokable under Claude Code.
- Preserve Claude health, authentication, models, effort controls, structured output, streaming, and cancellation.

A provider-neutral skill format can be designed later if desired. It is not required to validate this pipeline.

## 15. Security requirements

- Treat `#(name)` as a catalog lookup, never as a path.
- Prevent traversal and symlink escape from `agentSkillsRoot`.
- Do not let a skill increase sandbox permissions through its instructions.
- Keep existing network settings unchanged.
- Do not include secrets in skill files or generic prompts.
- Do not log resume contents or complete skill bodies by default.
- Preserve the existing worker message-size limit.
- Do not grant the frontend direct filesystem access to skills.
- Never overwrite an existing user-modified runtime skill during default installation.

## 16. Failure behavior

| Failure | Required behavior |
|---|---|
| Codex unavailable or unauthenticated | Use existing provider-health guidance |
| Malformed local `SKILL.md` | Return other valid skills and a scoped catalog error |
| Unknown `#(name)` | Block submission and offer to refresh |
| Skill deleted after autocomplete | Refresh once, then ask the user to select again |
| Provider changed to Claude | Preserve draft and block Codex skill submission |
| Installed Codex does not discover test skill | Report compatibility evidence; do not add App Server or prompt injection as a silent fallback |
| Skill job fails | Preserve existing resume restoration/error behavior |
| `bazinga-test` activates implicitly | Treat as a failing test |

## 17. Testing requirements

### 17.1 Unit tests

Add tests for:

- Catalog parsing with valid, missing, malformed, and incomplete frontmatter.
- Catalog path traversal and symlink protection.
- Default skill installation preserving an existing file.
- `#(...)` parsing with zero, one, repeated, multiple, malformed, and unknown mentions.
- Exact transformation of resolved `#(name)` into `$name`.
- Preservation of ordinary hashtags and surrounding prompt text.
- Provider validation when Claude Code is selected.

### 17.2 Existing pipeline tests

Verify:

- `workingDirectory` remains the resume directory.
- Skill invocation is still an ordinary string prompt at the worker boundary.
- The current SDK runner still receives existing model, reasoning effort, sandbox, output schema, and cancellation options.
- No worker protocol change occurred unless explicitly justified by a discovered requirement.

### 17.3 End-to-end acceptance

With authenticated Codex available:

1. Start MuttJobs without a runtime `bazinga-test` directory.
2. Verify MuttJobs installs the bundled skill.
3. Verify the skill appears when typing `#(` with Codex selected.
4. Submit `#(bazinga-test) Explain what MuttJobs does in two short sentences.`
5. Inspect the effective prompt and confirm it contains `$bazinga-test` but not the skill body.
6. Verify every final user-facing sentence ends in `Bazinga!`.
7. Verify no response post-processing added the suffix.
8. Verify no resume JSON or unrelated file changed.
9. Submit the same request without the skill mention and verify Bazinga behavior does not activate.
10. Select Claude Code and verify autocomplete is hidden and an existing mention cannot be submitted.
11. Modify the runtime `SKILL.md`, reopen/refresh the sidebar, and verify updated metadata appears without overwriting the file.

The acceptance test fails if the Bazinga instruction exists in a generic application prompt or the response is modified after Codex returns it.

## 18. Verification commands

Run checks appropriate to the implementation diff. At minimum:

```powershell
npm run build:worker -- --bundle-only
npm run build
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
git diff --check
```

Also run the existing packaged-worker initialize/health/shutdown smoke test. If browser/Tauri UI automation is unavailable, report runtime UI verification as incomplete rather than claiming it passed.

## 19. Suggested implementation order

1. Add shared workspace/skill-root helpers.
2. Package and safely seed `bazinga-test`.
3. Add the Tauri filesystem catalog and validation tests.
4. Add frontend catalog loading and `#(` autocomplete.
5. Add backend-authoritative `#(name)` to `$name` transformation.
6. Send the resulting prompt through the unchanged worker/SDK runner.
7. Prove native discovery and Bazinga behavior end to end.
8. Document the authoring boundary without adding production skills.
9. Run all relevant frontend, worker, Rust, and runtime checks.
10. Update README/worker documentation with the final behavior and Codex-only limitation.

## 20. Definition of done

This work is complete only when:

- The existing Codex SDK runner and short-lived worker lifecycle remain in place.
- No Codex App Server integration was added.
- `bazinga-test` exists as a real runtime `SKILL.md` installed from a bundled resource.
- MuttJobs reads local metadata for autocomplete but does not inject the skill body.
- `#(bazinga-test)` is validated and becomes `$bazinga-test` in the effective prompt.
- That prompt travels through the current `run_resume_ai_job` and `AgentJobRequest.prompt` path.
- Codex itself discovers and loads the skill from the existing working directory.
- The Bazinga behavior is observed without generic prompt injection or response post-processing.
- The skill does not activate without explicit invocation.
- No resume file changes during the fixture test.
- Claude Code is not presented as supporting native Codex skills.
- Existing provider/model/effort, streaming, cancellation, resume editing, and undo behavior do not regress.
- Tests and documentation are complete.

## 21. First prompt for a new implementation chat

Use this prompt from the MuttJobs repository root:

```text
Implement custom-skill-pipeline-spec.md end to end. Read the entire spec first and inspect the current repository before changing files. This must extend the existing React -> Tauri -> packaged Node worker -> @openai/codex-sdk pipeline; do not replace it with Codex App Server, do not make the worker persistent, and do not inject SKILL.md bodies into generic prompts. MuttJobs should catalog local .agents/skills metadata for #(name) autocomplete, validate mentions in Tauri, translate them to normal Codex $name prompt syntax, and send the resulting string through the existing job runner. Create no production resume skills; the only fixture is bazinga-test. Verify native skill discovery with the installed Codex runtime, preserve unrelated dirty-worktree changes, and complete the relevant builds and tests.
```
