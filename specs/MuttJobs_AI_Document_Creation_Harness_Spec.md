# MuttJobs: Evidence-Guided AI Document Creation Harness

Design specification · September 9, 2026

Scope: replace whole-document AI generation in the Job Workspace with a persistent, tool-driven document creator, starting with targeted resumes and extending the same contract to cover letters and document assessment.

Status: proposed implementation contract. This document specifies a feature; it does not claim that the harness exists. Repository baseline inspected: `26c4d44926c619f927654fc9d4881c72c3a31ef1`, including current uncommitted Job Workspace improvements. Published as [GitHub issue #2](https://github.com/Gohostieee/MuttJobs/issues/2), labeled `ready-for-agent`.

## Problem Statement

After confirming what an employer wants and approving supporting experience, the user should be able to create a tailored resume without becoming responsible for the AI's internal bookkeeping. Instead, the current creator asks the model to return an entire canonical document as a serialized JSON string, plus a separate list of document placements and evidence IDs. The model must simultaneously write prose, reproduce a large schema, preserve existing content, choose requirements, construct field pointers, copy exact quotations, and maintain evidence ownership.

The observed failure was structural. Across two failed runs, the model used real, approved evidence IDs but associated many with the wrong requirements. In the latest inspected output, 14 of 21 placements contained at least one such mismatch; 27 of its 47 evidence references belonged to a different requirement. The application rejected the complete proposal with “Proposal references unsupported evidence.” These counts describe the inspected runs, not a measured general failure rate.

The user had already done the requested evidence work. Reloading the profile could not repair the generated associations. A stronger instruction or a final retry would leave the model responsible for the same fragile construction process.

The existing foundations are useful: a Career Profile, confirmed requirement-to-evidence relationships, canonical resume and cover-letter schemas, document rendering and editing, proposal acceptance, coverage review, a supervised provider worker, and revision-aware persistence. The missing module is a document creator that makes these foundations available through constrained tools and owns the intermediate state.

There are three distinct correctness questions: does the document conform to its schema, do its references belong to the intended requirements, and does its prose truthfully express those references? They require different checks. A schema-valid document with valid IDs can still make an unsupported claim.

## Solution

Build an application-owned **Document Creation module**. The AI is its planner and writer. It receives a small, predefined tool interface for inspecting approved material, choosing a document plan, proposing individual passages, inspecting feedback, revising passages, and requesting final review. The module creates and validates the canonical document, maintains all identifiers and provenance, and controls publication into the saved application artifact.

The user starts with **Create tailored resume**, chooses model and reasoning, and sees one current stage: Planning, Writing, Checking, or Ready to review. A concise target summary and document preview explain the result. Optional activity and provider-supplied reasoning remain collapsible. Internal tool names, field pointers, schema details, and reference IDs do not appear in the normal workflow.

A requirement without supporting experience becomes an explicit gap or omission. It does not become permission to invent a qualification or stop useful work on every other requirement. New experience can be added to the Career Profile from that gap, reviewed, and incorporated into the affected part of the draft without repeating unrelated approvals.

The application issues a **work unit** that binds a requirement, its criteria, its approved evidence, and an allowed destination. The AI can write within that work unit, but cannot rewrite what evidence belongs to it. A passage may support multiple requirements only through separate, valid bindings. The application derives the final document placements from the actual assembled document.

The output is a reviewable document, its proposed target coverage, and an understandable account of omissions and unresolved questions. The user saves it explicitly. Document acceptance, evidence approval, coverage review, and application pipeline stage remain separate decisions.

## User Stories

1. As a job seeker, I want the creator to use the requirements I confirmed, so that it does not reinterpret the posting independently.
2. As a job seeker, I want approved evidence to be the source of targeted claims, so that my resume reflects experience I actually supplied.
3. As a job seeker, I want to choose model and reasoning before starting, so that I control the run configuration.
4. As a job seeker, I want unsupported provider settings explained before a run, so that the application does not silently substitute a different configuration.
5. As a job seeker, I want to choose the primary resume or optional cover letter, so that I create the artifact I need.
6. As a job seeker, I want page and document preferences to have sensible defaults, so that creation does not require a configuration interview.
7. As a job seeker, I want the creator to identify supported requirements and gaps before writing, so that its work has a clear basis.
8. As a job seeker, I want useful drafting to continue when some requirements lack evidence, so that an incomplete match does not block my application.
9. As a job seeker, I want adding missing experience to preserve unrelated approvals, so that I do not repeat completed work.
10. As a job seeker, I want new experience saved to my Career Profile, so that it remains available for future applications.
11. As a job seeker, I want newly supplied experience reviewed before targeted use, so that saving a fact and approving its relevance remain distinct.
12. As a job seeker, I want an affected draft passage to update after evidence approval, so that I do not regenerate the entire resume.
13. As a job seeker, I want accurate employer, title, date, and project information copied from saved records, so that the AI cannot silently rewrite my history.
14. As a job seeker, I want evidence associated with the correct role or project, so that an achievement does not migrate to a different employer.
15. As a job seeker, I want unclear ownership of an achievement surfaced as a question, so that the creator does not guess where it happened.
16. As a job seeker, I want the most relevant accomplishments prioritized, so that the resume has a deliberate narrative.
17. As a job seeker, I want one accomplishment to address several requirements when justified, so that my resume avoids repetitive bullets.
18. As a job seeker, I want each such requirement supported independently, so that an AWS claim cannot inherit approval from an agile-methodology match.
19. As a job seeker, I want required alternatives interpreted correctly, so that evidence for Vue is not presented as experience with every listed framework.
20. As a job seeker, I want partial and transferable experience worded accurately, so that the creator does not exaggerate my proficiency.
21. As a job seeker, I want unsupported metrics and leadership claims excluded, so that stronger prose does not create fictional accomplishments.
22. As a job seeker, I want private Career Profile context kept out of the resume, so that planning preferences do not become application content.
23. As a job seeker, I want my existing resume style and manually edited passages preserved, so that tailoring does not undo my work.
24. As a job seeker, I want a fresh draft when no resume exists, so that the creator can produce a complete document from eligible profile material.
25. As a job seeker, I want the resume to open in the normal editor and export pipeline, so that generated documents are not a separate incompatible format.
26. As a job seeker, I want page fit and readable layout checked using the real renderer, so that a schema-valid result is also usable.
27. As a job seeker, I want the creator to shorten or remove lower-priority material before reducing readability, so that fitting a page does not produce tiny text.
28. As a job seeker, I want to see the actual draft while it is built, so that progress is tangible.
29. As a job seeker, I want one clear current action, so that progress, warnings, and optional details do not compete for attention.
30. As a job seeker, I want to expand live reasoning and tool activity, so that I can inspect the provider's reported work when useful.
31. As a job seeker, I want a local writing failure repaired locally, so that a bad passage does not discard successful sections.
32. As a job seeker, I want actionable failure messages tied to a requirement or passage, so that I understand what needs attention.
33. As a job seeker, I want bounded retries and visible run limits, so that the creator cannot spend indefinitely without progress.
34. As a job seeker, I want cancellation to preserve the last valid draft, so that stopping a run does not lose completed work.
35. As a job seeker, I want drafting to continue while I navigate elsewhere, so that I can keep using the application.
36. As a job seeker, I want interrupted drafts recoverable after restarting the app, so that background work is not dependent on one mounted screen.
37. As a job seeker, I want resume to be an explicit action after restart, so that reopening the application does not silently invoke a provider.
38. As a job seeker, I want concurrent profile and document changes handled safely, so that a stale run cannot overwrite newer work.
39. As a job seeker, I want a diff between my saved resume and the proposal, so that I can review additions, changes, and removals.
40. As a job seeker, I want unsupported passages clearly identified and excluded from finalization, so that they cannot hide inside an otherwise polished draft.
41. As a job seeker, I want to edit the proposal before saving, so that I retain control over its wording.
42. As a job seeker, I want a saved document only when I explicitly accept it, so that generation never replaces an authoritative artifact on its own.
43. As a job seeker, I want coverage to refer to the final saved text, so that its status is not based on an abandoned draft.
44. As a job seeker, I want changed or removed text to invalidate only affected coverage, so that completion remains meaningful without resetting everything.
45. As a job seeker, I want omissions and acknowledged gaps to remain visible, so that the application does not imply every requirement was satisfied.
46. As a job seeker, I want a cover letter grounded in the accepted primary resume, so that it does not introduce unreviewed candidate claims.
47. As a job seeker, I want optional company research used only for employer context, so that a company claim cannot become evidence of my experience.
48. As a job seeker, I want bulk jobs to have isolated drafts and progress, so that one job's evidence cannot enter another job's resume.
49. As a job seeker, I want successful bulk drafts retained when another fails, so that I can review completed work immediately.
50. As an existing user, I want my jobs, documents, approvals, and application stages preserved, so that adopting the creator does not require migration by regeneration.
51. As an application maintainer, I want every accepted tool mutation recorded with its inputs and result, so that failures can be reproduced without asking a user to run the AI again.
52. As an application maintainer, I want a scripted provider to exercise the complete creation interface, so that correctness tests do not depend on probabilistic output.
53. As an application maintainer, I want live-provider evaluations kept separate from deterministic checks, so that a passing mock does not stand in for real integration evidence.
54. As an application maintainer, I want one versioned tool contract across providers, so that provider changes do not weaken document rules.
55. As an application maintainer, I want malformed or unauthorized tool calls rejected before mutation, so that provider output cannot bypass application validation.
56. As an application maintainer, I want diagnostic records to exclude credentials and private unrelated profile material, so that recoverability does not become indiscriminate logging.

## Implementation Decisions

### 1. Domain and ownership

- Retain **Job Target Checklist**, **Target**, **Career Profile**, **Evidence**, **Proposal**, **Coverage**, **Preparation Action**, and **Application stage** as existing domain concepts. “Task” in the user's request primarily means a Target to address; an existing Preparation Action is ancillary work, not a credential or a completion authority.
- Introduce **Creation Session**, **Document Plan**, **Work Unit**, **Draft Passage**, **Evidence Binding**, **Validation Finding**, and **Document Checkpoint** inside the Document Creation module. These objects are not new mandatory screens.
- The application owns identifiers, target-to-evidence associations, source revisions, document addresses, state transitions, and writes. The AI owns proposed selection, ordering, wording, and explanations of editorial tradeoffs.
- An approved Evidence record is permission to use particular experience for a particular Target. It is not permission to use that experience for every Target. The same underlying profile fact may support multiple Targets only when each relationship has been reviewed separately.
- A verified reference means its source identity and excerpt are valid. It does not establish an independently proven real-world fact or guarantee that an AI paraphrase is entailed by it.

### 2. Module interface and storage

- Add Document Creation behind the existing Job Workspace interface. Its small application-facing interface is start, read session, observe events, cancel, resume, revise a draft passage, and accept or reject a proposal. Callers do not orchestrate writing passes or construct evidence placements.
- The existing workspace operations for prepare and audit delegate to this module. A subsequent cover-letter implementation uses the same lifecycle with different allowed destinations and factual authority. Existing general-purpose document editing remains separate until explicitly routed through this contract.
- Keep canonical document JSON compatible with the current renderer, editor, and exporters. Store plan, passage identities, provenance, run history, and validation results as a versioned sidecar; do not add arbitrary harness keys to canonical resume JSON.
- Persist a session's job, artifact kind, selected Targets, requested and effective provider settings, schema version/hash, policy version, snapshot manifest, draft revision, state, checkpoint, tool journal, usage, and active attempt. Retain enough local input and result data to replay validation without provider access.
- Session data belongs in application data and backups, never in a temporary provider working directory or source repository. A session must be deletable with its job and through an explicit local-history cleanup action. Keep the latest accepted session and at most five recent failed/interrupted sessions per job by default; explicit pinned diagnostics survive automatic pruning. Do not delete active or resumable checkpoints.

### 3. Application-owned tool loop

- Use an application-owned typed tool dispatcher. A provider turn returns a validated tool call envelope, the host executes the permitted tool, and its structured result becomes the next turn's observation. The host, not model text, advances the state machine.
- The first implementation uses the existing worker's structured-output transport for these envelopes. This is an iterative tool protocol, not a request for a final document with differently named fields. Every mutation reaches a real host handler and receives validation feedback before further writing.
- Do not make delivery depend on unverified native custom-tool support in either provider adapter. A future native-tool transport can satisfy the same interface after conformance testing; it cannot acquire extra write privileges or change validation semantics.
- The current worker executes a single structured job per request. Introduce a document-step job kind and a versioned capability negotiation for the tool-envelope contract. Each provider step has a unique worker request ID associated with its parent Creation Session. Keep the worker provider-focused; business rules and persistence remain in the host.
- Initial turns may be independent provider invocations using a bounded host-generated context packet. Provider conversation state is an optimization, not the only record of progress. Resume reconstructs context from persisted state and tool observations.
- Expose tools appropriate to the current phase only. Disable ambient shell, file writes, web search, unrelated MCP servers, plugins, skills, memory, and agent delegation for creation. Supply the relevant resume guide and policies explicitly. Verify effective isolation for every supported adapter; do not interpret a prompt instruction as tool isolation.
- Source documents, user-entered experience, employer research, earlier model text, and tool errors are untrusted data. They cannot grant new tools or override the host's allowed operations.

### 4. Tool contract

All tools use strict, versioned request and response schemas with unknown properties rejected, length/count limits, and explicit error codes. The host injects session identity and authority. The model cannot choose a job ID, filesystem path, saved-artifact path, or another session's scope.

Mutating calls require a client call ID and expected draft revision. The host journals their result atomically with the mutation. Repeating the same call and arguments returns the recorded result; reusing a call ID with different arguments fails. Tool results include the resulting draft revision and allowed next actions.

| Tool | Model supplies | Host behavior and result |
|---|---|---|
| `get_creation_context` | Optional bounded page cursor | Returns artifact preferences, selected Targets and criteria, priorities, eligible sources, current draft outline, and unresolved gaps. Sensitive/private profile context is excluded. |
| `get_target_evidence` | A Target handle from context | Returns only current, confirmed, supported evidence for that Target, exact source excerpts, owning profile entries/roles, and criterion limitations. Returns an explicit gap when none exists. |
| `get_source_record` | An eligible source-record handle | Returns public document facts and ownership context needed to place experience correctly. It cannot be used to browse arbitrary profile fields. |
| `set_document_plan` | Ordered eligible source handles, requested section purposes, page mode, and Target dispositions | Validates a complete initial plan, assigns host section/entry handles, copies immutable facts, and returns allowed destinations and work budgets. Target dispositions are draft, omit, or ask for evidence, with a reason. |
| `open_work_unit` | Target handle, same-Target evidence handles, destination handle, optional existing passage handle | Validates ownership and eligibility, then issues an opaque work-unit handle binding the Target, criteria, evidence revisions, source ownership, and allowed destination. No reassignment after issuance. |
| `propose_passage` | Work-unit handle, plain-text passage or bullet list, bounded clause-to-source annotations | Validates text, locked facts, source restrictions, word limits, and semantic findings. Stores a valid candidate or returns localized errors. The AI supplies neither JSON Pointer nor final placement IDs. |
| `bind_additional_target` | Existing passage handle and a work-unit handle for another Target | Independently checks that the existing passage supports the additional Target using its approved evidence. Adds a separate binding only when valid. It never copies the first Target's evidence association. |
| `revise_passage` | Passage handle, expected passage revision, replacement text, existing eligible bindings | Runs the same checks as initial writing; invalidates prior findings for the changed text and checkpoints successful revisions. Cannot edit immutable source facts. |
| `update_plan` | Host handles to reorder/include/omit and editorial reason | Applies allowed structural changes, detects orphaned bindings, and recomputes draft coverage. Cannot silently remove a user's locked passage. |
| `record_gap` | Target handle and reason; optional concise question | Records a missing-evidence or unresolved-ownership request. Does not mark the Target matched, addressed, or dismissed. |
| `inspect_draft` | Optional section handle | Returns current rendered-text structure, passage handles, bindings, and outstanding findings. Bounded pagination avoids resending the complete profile. |
| `validate_draft` | Requested scope: passage, section, or complete document | Runs structural, reference, content, coverage, and available layout checks. Returns stable finding IDs, severity, affected handles, and permitted repair actions. |
| `finalize_for_review` | Expected draft revision | Revalidates the complete materialized document and dependencies. Creates an immutable Proposal checkpoint or returns blockers. Never writes the saved primary resume or marks coverage reviewed. |

Read tools may be batched with a maximum of four independent calls per turn. Document mutations are sequential in the first release; fewer race conditions and reproducible validation are more valuable than parallel bullet writing. No raw JSON patch, generic write-file, execute-code, arbitrary HTML, set-evidence-status, or accept-document tool is available to the AI.

### 5. Evidence bindings and claim construction

- Every work unit is issued from current eligible evidence: Confirmed review, Strong or Partial support, valid reference ownership, current dependency revisions, and the exact requested Target. Empty references cannot authorize prose.
- Handles are opaque host-issued references, resolved against the session on every call. A model-generated handle, another job's handle, or a handle that is valid for a different Target receives a typed rejection with no mutation.
- Retain the original Evidence IDs internally for compatibility, but do not ask the model to construct the final list of Evidence IDs for a document placement. Materialization derives it from accepted bindings.
- Preserve role/project ownership. Company, position, date, degree, and similar identity facts are copied from the source record by the host. AI-authored bullets may go only into destinations allowed by the supporting source. Cross-role summaries may combine evidence only with explicit clause-level bindings and no false attribution to one employer.
- Free-form experience added for a missing Target may lack employer, dates, or role ownership. It is immediately available as reviewed evidence, but cannot be inserted beneath a specific employment entry by inference. Use an appropriate unattributed summary if truthful, or ask one concise ownership question. Existing facts need not be re-entered.
- Split candidate prose into identifiable passages and, where needed, clauses. Every targeted factual clause identifies the source excerpt supporting it. Numbers, technologies, dates, and ownership language receive explicit checks; a legitimate derived metric requires a documented deterministic transformation and its inputs, otherwise omit it.
- Preserve the distinction between evidence relevance and coverage. A confirmed Partial match can support a carefully limited statement, but cannot establish all criteria of a requirement. Any-of, all-of, alternatives, minimum quantities, and contradictory evidence remain visible in the coverage result.
- Non-targeted factual content such as contact details, basic work history, and education may be copied from eligible public profile fields without inventing a Target match. Mark it as baseline provenance with no coverage credit. Exclude private motivations, compensation preferences, deal-breakers, and planning context by an allowlist.
- Existing manually authored text is preserved as baseline content when tailoring. It is not automatically upgraded to confirmed target evidence. Newly introduced or strengthened factual claims must pass the new evidence rules. User-locked passages cannot be rewritten automatically.

### 6. Canonical schema and materialization

- Treat the resume schema as the final storage contract, not the full model writing interface. Derive the subset of available destinations from an explicit, versioned mapping of supported schema concepts. Contract tests must fail if required schema changes make that mapping incomplete.
- Start a new document from host defaults plus eligible source records, or start tailoring from a snapshot of the saved document. Preserve picture, metadata, typography, section settings, and unrelated content unless the user requested a layout change.
- Support real schema shapes: summary content, experience descriptions, nested experience-role descriptions, projects, skills, education, and appropriate custom sections. The current schema stores some prose as rich-text strings rather than independent bullet objects; maintain stable passage identities in the sidecar and render those passages into the required fields.
- Accept plain text and typed bullet lists from the model. The materializer escapes content and produces approved rich-text markup. It does not accept arbitrary model HTML, unsafe links, hidden markup, or layout instructions embedded in prose. Preserved preexisting rich text follows the existing normalization and sanitization rules.
- The host allocates new document item IDs, resolves nested roles, and preserves existing IDs where identity is unchanged. Reordering entries cannot orphan provenance. Never use an array index as the durable identity of a work unit or passage.
- At finalization, derive JSON Pointers and exact serialized excerpts from the assembled canonical document and accepted passage map. Recompute them after reordering, normalization, or edits; do not trust offsets or quotations from a previous draft.
- Run the canonical validator after structural mutations and on the complete final artifact. Normalization must not silently drop evidence-bearing text: verify post-normalization passage presence and hashes. Treat the schema's permissive root extension behavior as compatibility, not authorization to invent fields.
- Reuse the existing resume guide's truthfulness, concision, and bullet limits, including the existing 30-word maximum validation, across both ordinary and nested role bullets. Keep style lint distinct from structural failure and unsupported claims.

### 7. Validation and semantic limits

Validation produces findings, not one undifferentiated error string. Findings include a stable code, scope handle, requirement label where relevant, safe user-facing message, machine-readable details, and allowed repair actions.

| Layer | Checks | Required response |
|---|---|---|
| Protocol | Known tool, allowed phase, strict arguments, valid session handles, payload bounds | Reject the call without changing state. |
| Structure | Canonical types, required fields, allowed destination, stable identity, rich-text safety | Return the field or destination that needs correction; preserve the prior checkpoint. |
| Provenance | Same-Target evidence, reviewed status, exact excerpts, owning entry/role, current source fingerprints | Reject the binding or affected passage; never silently swap evidence from another Target. |
| Deterministic claim checks | New numbers, dates, credentials, named technologies, forbidden ownership changes, word budgets | Block clearly unsupported additions; request narrower wording or eligible source material. |
| Semantic support | Whether each clause follows from its allowed evidence and actually addresses its stated criterion | A separate constrained verification pass returns supported, unsupported, or uncertain with cited source clauses. Unsupported/uncertain targeted text cannot be finalized unchanged. |
| Document quality | Duplication, contradictory dates or claims, missing planned sections, priority tradeoffs, repetition | Repair locally or record a visible editorial warning. |
| Rendering | Page count, overflow, clipped content, broken links, and text availability in the existing renderer/export pipeline | Revise content/order within permitted rules or return an explicit layout issue. |

- The writer cannot certify its own passage by supplying a boolean. Semantic verification runs as a distinct, constrained invocation with the candidate passage and only its authorized evidence. Its output is advisory evidence for the host, not permission to override failed deterministic checks.
- Semantic verification is probabilistic. Do not claim the harness can prove all natural-language truth mechanically. Final human review remains necessary, and deterministic reference correctness is reported separately from semantic and layout checks.
- An uncertain passage can be revised, omitted with an explanation, or resolved by the user supplying clearer evidence. A generic “ignore all checks” control is not part of the creator. A user may still edit their own document; doing so must invalidate affected coverage rather than laundering the edit into verified provenance.
- Missing evidence for a Target is not itself a document-validation error. A supported partial resume with explicit omissions is a valid reviewable result. A document containing unsupported new claims is not.

### 8. State machine, iteration, and budgets

- Creation Session states: Queued → Planning → Writing → Checking → Ready for review → Accepted or Rejected. Any active stage may transition to Paused for input, Interrupted, Cancelled, or Failed. Resume starts from the last valid checkpoint after preflight, never from undocumented provider memory.
- The plan assigns every selected Target a disposition. Finalization requires each Target to have a proposed placement or an explicit gap/omission; this is accounting completeness, not a requirement to manufacture complete coverage.
- Prefer a host-ordered writing queue by Target priority and evidence usefulness, grouped by source entry to reduce repetition. The writer can propose reordering, but the host validates it against locks, word budgets, and omission accounting.
- Derive the initial provider-turn allowance from the accepted plan: 12 orchestration turns plus three turns per planned passage, capped at 120 provider turns. Set an additional limit of 240 tool calls, two repairs per passage/finding, and a 20-minute session wall-clock limit. A fixed small turn allowance must not make a normal multi-role resume impossible to finish. These are starting product limits to tune through evaluation, not claims about expected latency. Semantic-check calls count toward provider-turn and usage limits; related passages may be verified in a bounded section batch while retaining individual findings. Show the planned allowance before writing and stop before exceeding it. At a limit, preserve a resumable checkpoint and require explicit continuation with a new budget.
- Detect repeated identical invalid calls and no-progress cycles. One malformed envelope may receive corrective feedback; repeated protocol failure terminates the attempt. A provider outage is not mislabeled as a content-repair opportunity.
- No provider invocation occurs while holding the workspace write lock. Each accepted mutation checks session/draft revision, journals its result, and checkpoints under the appropriate job/artifact lock. Cancellation is checked before each call, after each provider result, before mutation, and before finalization.
- Cancel the active child step and parent session together. Late provider results are fenced by attempt identity and cannot revive a cancelled session or overwrite resumed work. Duplicate completion events are idempotent.

### 9. Revision handling, recovery, and acceptance

- Capture dependencies by the identity and fingerprint of used Targets, criteria, evidence approvals, referenced profile fields and owners, baseline document passages, and schema/policy version. Record a whole-profile revision for diagnostics, but do not treat every unrelated addition as invalidating every passage.
- A changed referenced field or evidence approval invalidates its dependent work units and passages. An unrelated new profile section preserves them. Reordered profile arrays require verified stable-owner resolution before refreshing paths; do not remap based on similar text alone.
- Keep legacy whole-profile guards during migration until the new dependency checks have equivalent tests. Removing a coarse guard without implementing the replacement is not an acceptable optimization.
- If the user adds evidence while drafting, pause affected work at the next safe point, save to the canonical Career Profile, and obtain the existing evidence approval. Reissue only affected work units. Never automatically approve newly saved evidence as a side effect of resuming.
- If the authoritative document changes during a run, preserve the draft as a proposal but block acceptance against the stale base. Offer a comparison and explicit rebase that preserves newer user edits; overlapping changes require resolution. Never silently overwrite the newer document.
- Accepting a proposal atomically writes canonical content, provenance sidecar, and proposed coverage, with existing recovery protections and a recoverable previous version. At acceptance, revalidate current dependencies and exact document placements. A failed transaction must not leave mixed versions.
- Saving a proposal does not mark its Targets Addressed. Coverage remains proposed/unreviewed until the user reviews the actual saved passage and relevant criteria. Application stage remains independently controlled.
- Persist app-owned progress and accepted tool events independently of the in-memory background activity store. On reopening, show the last checkpoint and its actual status. Reconnect to a still-owned active process when supported; otherwise mark interrupted and provide Resume. Do not display “running” indefinitely because a process disappeared.

### 10. Product flow

- Keep the existing requirement confirmation and one-click evidence approval. Rename the document action to **Create tailored resume** or **Create cover letter**. Model and reasoning controls stay next to the creation flow and are fixed for an active attempt.
- Preflight shows only actionable blockers: no confirmed requirements, no usable evidence at all, missing primary resume for a cover letter, unavailable provider capability, or an unresolved stale document base. Individual profile gaps are summarized and do not block the whole run.
- Show the current stage, a count of completed writing work units, a stable draft preview, and Cancel. Do not count requirements as “completed” merely because text was drafted. The user should not have to open a reasoning panel to know what is happening.
- Keep the existing reasoning component for provider-supplied reasoning summaries and the tool activity view for application events. Tool events report concrete results such as “Drafted experience section” and “Checking support for AWS familiarity.” Generic provider stages such as “exploring” do not replace product status. Missing provider reasoning produces an honest empty state, not invented reasoning.
- Display a gap inline with one action, **Add relevant experience**. Preserve entered text and retry state when saving succeeds but linking fails. Ask for employer/project attribution only when required for the intended placement.
- At Ready for review, present the document first, then concise additions/removals, proposed coverage, and omissions. Provide **Save resume**, **Edit draft**, and **Discard**. Expand detailed evidence and validation only on request.
- If repair cannot finish, retain successful work and show the failed passage or requirement with **Revise**, **Omit**, or **Add evidence**, as applicable. Never recommend Reload as a remedy for an invalid AI claim.
- Bulk creation uses the same module with one session per job/artifact, bounded concurrency, independent cancellation/retry, and no shared evidence handles. Opening another job does not lose the run configuration or progress.

### 11. Cover letters and assessment

- Implement resume creation first, but define artifact-specific destination and authority policies from the beginning. Do not fork a second unstructured generator for cover letters.
- For cover letters, the accepted primary resume is the factual authority for candidate claims. Its saved provenance may corroborate a claim, but profile-only claims cannot be introduced until added to and accepted in the resume. Saved company research remains separately labeled employer context and cannot authorize candidate experience.
- Assessing an existing saved document uses read-only inspection and proposes coverage bindings through the same validation rules. It neither regenerates the document nor upgrades its own text into independent evidence.
- Existing resumes and older proposals retain their data. Legacy provenance can be inspected and revalidated on demand; migration does not infer trusted bindings or automatically run providers.

### 12. Failure prevention demonstrated

Use synthetic test data: Target A asks for agile delivery and has approved Evidence A; Target B asks for AWS familiarity and has approved Evidence B. The creator requests a work unit for Target B with Evidence A. The host returns `EVIDENCE_TARGET_MISMATCH` before text or coverage changes. The response points to Target B's eligible evidence handles without relabeling Evidence A.

If Target B has no usable evidence, the creator records a gap and continues other work. If the model writes “Operated AWS infrastructure” using unrelated agile wording despite a structurally valid work unit, semantic validation rejects that clause. If the same truthful passage addresses both Targets, the application requires two independently valid bindings.

This prevents the observed ownership failure at the point of construction and handles the separate semantic failure explicitly. It does not defer both problems to one generic final exception.

## Testing Decisions

1. Use one primary external seam: the Document Creation behavior exposed through the Job Workspace interface. Supply a scripted provider adapter, exercise real tool dispatch, schema validation, revision checks, materialization, persistence, and recovery, and assert returned sessions, canonical documents, and coverage. Do not mock each private helper or assert implementation-specific call order.
2. Existing prior art is the Job Workspace's injected worker execution tests, real temporary application-data fixtures, revision/cancellation tests, and the browser fixture server that routes UI commands to the real Rust workspace logic. Extend these patterns rather than building a parallel fake document implementation.
3. The provider adapter is the necessary varying dependency. Script valid, malformed, duplicated, late, cross-session, and cross-Target calls through that seam. Native provider integration and browser interaction are supplemental acceptance checks, not separate copies of business-rule tests.
4. Build the first vertical slice around the observed failure: open work units for two Targets; attempt a cross-Target evidence binding; assert rejection, unchanged draft revision, preserved successful passage, and valid corrected continuation. Replay a sanitized representation of the two diagnosed failures without committing private profile material or provider transcripts.
5. Verify a complete resume from empty defaults and a tailored resume from an existing document, including nested employment roles, summary, projects, skills, education, custom sections, special characters, rich text, and normalization. Reorder entries and assert exact final pointers/excerpts and retained stable provenance.
6. Verify valid multi-Target coverage with separate bindings, any-of/all-of criteria, partial evidence, rejected/stale evidence, unknown handles, another job's handles, empty references, false metrics, misleading ownership language, unsupported credentials, and wrong-employer placement. Valid IDs alone must not make a claim acceptable.
7. Script semantic verifier supported/unsupported/uncertain results to exercise host behavior deterministically. Separately evaluate the real verifier on human-labeled paraphrases, fabricated metrics, exaggerated leadership, mixed-role attribution, and transferable experience. Report false acceptance and false rejection rather than claiming all truth checks are deterministic.
8. Test adding evidence for a missing Target during a paused run: existing approvals and unchanged passages survive, new evidence is persisted and reviewed, only affected work units are reissued, and no full-profile rematch or reload is necessary. Deleting or changing a referenced fact must invalidate its dependencies.
9. Inject failures before and after tool mutation, journal write, checkpoint, finalization, and artifact acceptance. Verify idempotent replay, no duplicate bullets, intact saved artifacts, recoverable drafts, cancellation fencing, safe restart, and no automatic provider invocation on reopen.
10. Verify two concurrent bulk jobs and two attempts for one artifact cannot leak handles, overwrite newer documents, or attach late results to the wrong session. Check bounded queues and localized retry.
11. Add schema compatibility tests between host tool definitions, worker structured-output schemas, canonical resume validation, and renderer expectations. Exercise unsupported model/effort combinations and worker-version mismatches; no silent provider or reasoning substitution is acceptable.
12. Use a small set of browser flows: start with selected model/effort; see truthful progress and draft; add a gap's evidence; inspect reasoning; edit and accept; return after navigation; cancel and resume; review coverage. Verify keyboard use, narrow windows, readable errors, and no nested scrolling trap. Passing Rust tests does not establish browser usability.
13. Render representative one- and two-page resumes through the existing document/export pipeline. Check page count, clipping, visible text, nested-role layout, and preservation of user styling. A renderer adapter may provide measurements, but tests should assert the exported/readable result rather than mock layout success.
14. Before release, run explicit live-provider evaluations with the user-selected model/effort on at least ten varied synthetic or permissioned jobs, including sparse evidence, dense evidence, partial support, multiple roles, and a cover letter. Zero accepted invalid ownership/schema mappings is a hard invariant. Record completion rate, unresolved semantic findings, human factual review, layout results, latency, tool/repair counts, and usage. Provider nondeterminism is a measured product concern, not a reason to weaken host checks.
15. Testing acceptance requires deterministic invariants, browser interaction, real renderer checks, and adapter isolation/conformance. Mark live evaluation and user visual acceptance separately. The automated suite must make it impossible to accept a document by bypassing the harness through a legacy prepare path.

## Out of Scope

- Replacing job discovery, posting analysis, the Career Profile editor, application stages, or company research generation.
- Requiring the user to reapprove every requirement or rewrite their profile before using the creator.
- Automatic job applications, external submission, or AI authority to save an accepted primary document.
- Claiming a universal ATS score, guaranteeing employment outcomes, or treating a semantic verifier as proof of real-world truth.
- Giving the creator unrestricted filesystem, shell, browser, network, plugin, or memory access.
- Building a generic workflow builder, exposing tool configuration as a required user interface, or orchestrating multiple writing agents in the first release.
- Replacing canonical resume/cover-letter schemas or changing the existing editor/export format to a new proprietary document format.
- Automatically mining unrelated private profile context or global provider sessions for extra candidate facts.
- Bulk conversion or regeneration of existing documents during migration.
- Requiring native provider custom-tool integration before delivering the application-owned tool protocol.

## Further Notes

- This specification supersedes the whole-response generation mechanism for targeted documents. It preserves the broader Target-driven Job Workspace model and the recent interaction improvements: clear next actions, one-click evidence approval, visible model/effort selection, optional reasoning, and additive profile changes that preserve unrelated approvals.
- Suggested delivery order is vertical: (1) session/work-unit/tool contract with cross-Target rejection and a persisted minimal resume; (2) evidence-bound writing, nested-role materialization, semantic checks, and local repair; (3) user review, acceptance, actual rendering, restart/cancellation, and bulk integration; (4) cover letters, saved-document assessment, migration compatibility, and live-provider evaluation. Each slice must reach the shared external seam with regression coverage before widening scope.
- Cut over behind a capability flag. Once a provider/artifact uses the harness, a failure must not silently fall back to unconstrained whole-document generation. Existing documents remain editable if creation capability is unavailable.
- The protocol and deterministic invariants are firm design decisions. Initial budgets and qualitative drafting policies are starting defaults to tune with evidence. Provider-specific isolation details must be verified against the installed adapters during implementation; they are not assumed to work because a flag is present.
- The user confirmed the proposed test seam: exercise the complete document-creation module through the existing Job Workspace interface with scripted AI tool calls and real validation/persistence, supplemented by browser acceptance flows. Any subsequent steering should update this contract and its acceptance scenarios together.
- The observed run counts above were recovered during the preceding investigation. No private source excerpts, provider session paths, live evidence IDs, credentials, or user-specific resume contents are required in the issue or regression fixtures.
