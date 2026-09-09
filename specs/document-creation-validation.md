# Document creation validation

Implementation of [issue #2](https://github.com/Gohostieee/MuttJobs/issues/2), evaluated on Windows on September 9, 2026. The detailed contract is [the creation harness spec](MuttJobs_AI_Document_Creation_Harness_Spec.md).

## What changed

Resume creation, cover-letter creation, and saved-document assessment now use persistent host-owned creation sessions. The provider returns one typed action at a time. Rust owns document structure, source ownership, revision checks, materialization, checkpoints, cancellation fences, and proposal acceptance. Generated text passes separate semantic verification. Acceptance saves a document; coverage review remains a separate user action.

Drafts support explicit continuation after cancellation or restart, localized wording repair, omissions, newly reviewed evidence, manual edits, and rebasing onto newer saved edits. Successful passages retain their identities. The UI previews the actual document renderer, checks page count and readability, and requires explicit Save. Font and preview changes refresh layout measurements.

Typed paragraphs and bullet lists can carry clause-to-source annotations. Each additional requirement binding has its own source mapping. Cross-role plain text is rejected until its clauses are attributed. Canonical profile fields that cannot be copied safely produce a repair error instead of silently disappearing.

## Automated checks

- Rust: 148 passed, 0 failed, 3 explicitly ignored live/server tests.
- JavaScript: 46 passed, 0 failed.
- Browser: 10 passed, including draft editing, reload persistence, acceptance, and evidence review.
- Frontend and worker TypeScript checks passed; production frontend and packaged worker builds passed.
- The final bounded schema regression also rejects copied evidence text and out-of-range source indices in the provider-facing schema.

The behavioral tests exercise the existing WorkspaceService with real temporary persistence and canonical validation, plus a scripted provider boundary. Browser tests use the real Rust fixture server and actual React document renderer.

Covered failures include foreign handles, cross-target evidence, unsupported numbers, semantic rejection, bounded repair, cancellation during verification, stale sources, stable-owner reordering, competing attempts, manual draft changes, stale saved documents, anchored replacement, skill-array assessment, nested employment roles, typed bullets, per-binding clause mappings, and independent acceptance/coverage review.

The worker bundle and frontend production build are separate checks. Existing public-directory import and large-chunk warnings are not introduced by this feature.

## Provider verification

Installed adapters checked: Codex CLI 0.153.4 with SDK 0.147.0; Claude Code 2.1.263. Worker protocol 4 advertises `documentStep: 1` and rejects incompatible workers.

Codex document steps run in a disposable directory using `--ignore-user-config`, `--ignore-rules`, `--ephemeral`, read-only sandboxing, explicit model/effort, and disabled ambient tools, web, plugins, skills, memory, and delegation. The adapter checks required isolation flags and rejects unexpected tool events. Authentication remains in the normal account location. Claude document steps use safe mode, empty tools, strict empty MCP configuration, disabled slash commands, empty settings sources, and no session persistence.

A live Claude two-requirement creation passed using `claude-sonnet-4-6` / `low`: 87 seconds, 11 writing/checking turns, two retained passages. The host rejected cross-target evidence, and the independent verifier rejected an invented onboarding purpose. Both errors were repaired locally before finalization. This run also verified the Windows stdin transport fix for growing prompts. An initial Codex resume smoke passed with `gpt-5.6-luna` / `max`.

Earlier live matrices exposed excessive context reads and premature omission of planned targets. Those runs were stopped, their failures retained locally, and the host's phase schema was tightened. Optional reads are bounded; an approved draft plan proceeds to a writing attempt before local repair or omission. Evidence arrays and source indices are constrained to host-issued choices, and work units expose their numbered source excerpts directly. No model or effort fallback was added.

The evaluation harness supports ten synthetic cases, including partial support, a nested-role profile, tailoring an existing resume, and a cover letter using a saved primary resume. It records sessions, proposals, latency, turns, journal entries, findings, and errors in the ignored `src-tauri/target/document-creation-evaluation.json` file. It never writes into real job data.

The principal Codex matrix (`gpt-5.6-luna` / `max`) completed nine of ten cases on its first full run. The letter case exposed a shared source-selection helper adding resume fields to a cover letter. Restricting that helper to resumes fixed the canonical-schema failure; the cover-letter regression now explicitly selects destinations and verifies primary-resume invalidation. A targeted live rerun of that case passed in 165 seconds. Thus all ten scenarios have successful results after the fix; this is not a claim of ten successes in the original uninterrupted matrix.

| Codex case | Seconds | Turns | Retained passages | Result |
| --- | ---: | ---: | ---: | --- |
| Vue services | 168 | 9 | 1 | Completed |
| AWS familiarity, partial support | 95 | 9 | 1 | Completed |
| Agile delivery | 87 | 9 | 1 | Completed |
| Mentoring | 85 | 9 | 1 | Completed |
| Accessibility | 103 | 9 | 1 | Completed |
| Data analysis | 94 | 9 | 1 | Completed |
| Documentation | 100 | 9 | 1 | Completed |
| Customer service, existing resume | 124 | 9 | 1 | Completed |
| Project work, nested roles | 119 | 9 | 1 | Completed |
| Transferable experience, cover letter | 165 | 9 | 1 | Completed on targeted rerun |

Each completed Codex resume recorded eight journal events. These are deliberately small integration cases, not complete career histories. The separate Claude run used two targets and two source excerpts. The evaluation helper did not retain provider usage events for these runs, so token/cost figures are unavailable; application jobs capture usage through the normal worker event path. Usage measurement and a human-labeled semantic false-acceptance/false-rejection evaluation remain release work.

Replay with `MUTTJOBS_EVAL_CODEX` set to the installed Codex executable, then run:

```powershell
$env:MUTTJOBS_CREATION_EVAL_CASES = '10'
$env:MUTTJOBS_CREATION_EVAL_EFFORT = 'max'
cargo test --manifest-path src-tauri/Cargo.toml live_creation_evaluation --lib -- --ignored --nocapture
```

To measure the completed live drafts with the actual renderer and retain screenshots:

```powershell
$env:MUTTJOBS_EVAL_LAYOUT = '1'
npx playwright test document-creation-layout.spec.ts
```

The optional test writes `test-results/document-creation-layout.json` and one screenshot per completed draft. It is skipped during ordinary CI runs and never starts a provider.

Final renderer evaluation passed for all eleven completed outputs: ten Codex drafts and one Claude draft. Every generated passage remained visible, every document fit its one-page target, and no clipping was detected. Screenshot inspection covered the nested-role resume, the cover letter, and the two-passage Claude resume. These sparse outputs do not establish two-page quality or native desktop interaction; the check uses the actual React renderers in the browser fixture.

Optional evaluation controls are `MUTTJOBS_CREATION_EVAL_START`, `MUTTJOBS_CREATION_EVAL_PROVIDER`, and `MUTTJOBS_CREATION_EVAL_MODEL`. For Claude, also set `MUTTJOBS_EVAL_CLAUDE` to its executable. These are explicit evaluation selections, not application fallbacks.

## Release acceptance

Automated schema/ownership checks and separate semantic verification do not constitute human factual approval. Human factual review and visual acceptance of representative complete resumes and cover letters remain release checks. The synthetic matrix is a provider integration evaluation, not evidence of performance across arbitrary real applications. No issue closure or publication is implied by the implementation commit.

## Review

Standards and spec reviews ran independently. Reported defects in read-tool scoping, state guards, stage classification, anchored revisions, competing resumes, ready-draft continuation, skill destinations, and per-binding clause verification were corrected and covered by targeted checks. String-valued workflow states remain a nonblocking maintainability concern. Optional employer research stays separate from candidate evidence; an explicit regression rejects attempts to turn employer AWS usage into candidate experience.
