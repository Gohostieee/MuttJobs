# MuttJobs: Target-Driven Job Workspace

**Design specification • September 5, 2026 • Version 1.0**

**Scope:** Rebuild the job section around a persistent Job Target Checklist, including the Applications overview, individual Job Workspace, evidence review, and target-guided document creation.

**Status:** Design proposal. No application code has been changed. No issue has been published. Intended triage label: `ready-for-agent`, not applied.

**Repository baseline:** MuttJobs revision `9247b6e2cde2e5da8974760227e8f043e485e00d`.

## Problem Statement

As a job seeker, I do not simply need somewhere to save a posting and generate a resume. I need to understand what the employer actually values, identify which parts of my real experience demonstrate those qualities, and work through the remaining preparation deliberately.

The analysis we performed on Chewy illustrates the missing workflow: read meaningful statements individually, distinguish explicit requirements from reasonable interpretations, turn them into concrete targets, and decide how to substantiate each target. A single candidate archetype or a collection of technology keywords loses too much of that reasoning.

MuttJobs currently presents a four-part Job Workspace: Description, Company data collection, Resume creation, and Cover letter creation. Its visible completion indicators and progress bar depend on the selected navigation step, not whether preparation has actually been completed. The description surface largely displays the posting and existing technology/keyword tags. [R1]

The Applications overview already supports saved jobs, pipeline stages, URL import, Company Research, and bulk document creation. However, its prominent actions center on producing artifacts, without a persistent, shared record of the hiring targets those artifacts should address. [R2]

There are valuable foundations to retain: a durable Career Profile, canonical job-specific documents, local storage and backups, an agent worker, and explicit separation between candidate evidence and employer context. The redesign should connect these foundations around a new operating model rather than replace them wholesale. [R3][R4]

**The central problem:** the job section organizes information and generated documents, but it does not yet organize the work of building a truthful, well-targeted application.

## Solution

Rebuild the job section as a **target-driven application workspace**. The primary object is a Job Target Checklist, not a wizard, fit percentage, or generated persona.

Each saved job should answer four questions immediately: What does this employer want? What evidence do I have? Where does my application demonstrate it? What should I do next?

### Applications becomes the preparation overview

Keep the existing **Applications** vocabulary and pipeline stages. Add a default list view alongside the board, with role, company, stage, analysis freshness, unresolved high-priority targets, document review state, and the next useful action. Preserve Search as the discovery entry point, but make saving or importing a job lead into the same Job Workspace.

Provide preparation filters such as Not analyzed, Evidence to review, Application work remaining, and Ready for review. These are views over preparation data, not replacements for Saved, In process, Applied, Interviewing, Offer, Denied, or Not interested.

Bulk actions become explicit preparation operations: Analyze selected jobs, Match Career Profile, Prepare targeted resumes, optionally Prepare cover letters, and Run Company Research. Show per-job progress and failures. Opening a page or selecting a job must not automatically spend credits or invoke an agent.

### The Job Workspace becomes a non-linear workbench

Replace the numbered four-step interface with a persistent job shell and four destinations: **Targets**, **Documents**, **Company Research**, and **Activity**. Targets is the default. Keep the original description accessible as a source panel from anywhere in the workspace.

The header retains role, company, location, compensation, original-posting link, and application stage. A compact preparation summary explains what remains. Document editing must not make the job context disappear.

On Targets, display a prioritized checklist in the main area. Selecting a target opens an inspector with its source passages, meaning, inference status, desired evidence, linked Career Profile entries, document coverage, and next actions. At narrower widths, the inspector becomes a drawer rather than squeezing the document and checklist into unreadable columns.

An unanalyzed job shows its posting and an **Analyze job** action. A missing or incomplete posting offers correction or paste/import, not a fabricated checklist. After analysis, the next action may be Match Career Profile, Review evidence, or Address selected targets. The user can navigate freely and apply without completing every target.

### Each target connects demand, evidence, and action

For example, Chewy's references to a real-time event system and Kafka/SNS/SQS can produce **Demonstrate event-driven backend experience**. The target preserves those source passages, identifies the explicit architecture signal, and labels retries or idempotency as possible supporting engineering topics rather than requirements Chewy explicitly stated.

The checklist then distinguishes candidate evidence from its presentation. A user may already have relevant experience that is missing from the resume. Conversely, a polished bullet does not establish experience that the user never had.

A target's checkbox represents **addressed in the selected application artifact**, with traceable supporting evidence and reviewed placement. It does not mean “the employer will accept this candidate.” Acknowledging a gap or choosing not to address something does not turn it into a match.

**Core workflow:** save a job; decode its targets; review their meaning; connect real evidence; prepare targeted materials; verify coverage; track the application. These are available capabilities, not a compulsory wizard.

## User Stories

### Discover and organize jobs

1. As a job seeker, I want saved search results and imported postings to open the same Job Workspace, so that preparation does not depend on the job's source.
2. As a job seeker, I want to paste a complete posting as well as import a URL, so that inaccessible or copied job descriptions remain usable.
3. As a job seeker, I want to correct imported job text while retaining the original source, so that analysis uses the intended posting without erasing provenance.
4. As a job seeker, I want a list and a board for Applications, so that I can organize preparation and track pipeline stages separately.
5. As a job seeker, I want each job to show its next useful action, so that I can decide where to spend preparation time.
6. As a job seeker, I want filters for analysis, evidence, preparation, and freshness, so that I can find jobs needing a particular kind of work.
7. As a job seeker, I want salary, location, and work-arrangement facts visible separately from competency targets, so that I can decide whether the role suits me.
8. As a job seeker, I want explicit control over analysis and bulk runs, so that viewing jobs does not consume provider usage or discovery credits.

### Decode the posting

9. As a job seeker, I want every meaningful hiring statement considered, so that important signals outside the qualifications section are not overlooked.
10. As a job seeker, I want an actionable target list instead of a single archetype, so that I can work through the application one point at a time.
11. As a job seeker, I want each target linked to exact source passages, so that I can verify why it exists.
12. As a job seeker, I want explicit requests separated from inferences, so that plausible interpretation is not presented as employer fact.
13. As a job seeker, I want required qualifications, responsibilities, preferences, and contextual signals distinguished, so that I can prioritize honestly.
14. As a job seeker, I want technology names and underlying capabilities represented separately, so that the checklist goes beyond keyword matching.
15. As a job seeker, I want alternative qualifications preserved, so that React, Vue, or Angular does not become three compulsory requirements.
16. As a job seeker, I want years-of-experience and degree-or-equivalent wording preserved, so that eligibility is not distorted during extraction.
17. As a job seeker, I want repeated signals merged with all supporting passages retained, so that the checklist is thorough without being repetitive.
18. As a job seeker, I want architecture, work style, ownership, collaboration, product, and business targets, so that analysis reflects the actual role.
19. As a job seeker, I want responsibilities turned into evidence expectations, so that I understand what experience would demonstrate them.
20. As a job seeker, I want ambiguity and incomplete source text flagged, so that uncertainty is visible rather than filled with assumptions.
21. As a job seeker, I want suggested proof types and useful measures labeled as examples, so that they are not mistaken for facts about me.
22. As a job seeker, I want to add, edit, merge, split, dismiss, and reprioritize targets, so that I can correct the analysis.

### Match real evidence

23. As a job seeker, I want the Career Profile matched against each target, so that relevant experience omitted from my current resume can be discovered.
24. As a job seeker, I want evidence links to exact profile entries and fields, so that every suggested claim remains traceable.
25. As a job seeker, I want direct and transferable evidence distinguished, so that an analogous tool is not presented as identical experience.
26. As a job seeker, I want missing documentation separated from confirmed lack of experience, so that an incomplete profile does not become a false disqualification.
27. As a job seeker, I want to confirm or reject suggested evidence, so that the system cannot silently exaggerate my background.
28. As a job seeker, I want to supply missing factual details through the Career Profile, so that corrections remain reusable across applications.
29. As a job seeker, I want one experience to support multiple targets when justified, so that I do not need duplicate claims or repetitive bullets.
30. As a job seeker, I want parent targets and supporting criteria evaluated coherently, so that one missing technology does not erase all relevant capability.
31. As a job seeker, I want employer information excluded from candidate evidence, so that the application remains truthful.
32. As a job seeker, I want stale or conflicting evidence flagged, so that old assessments do not silently survive changed facts.

### Prepare the application

33. As a job seeker, I want targets grouped into actionable work, so that I can distinguish evidence review, writing work, genuine gaps, and optional preparation.
34. As a job seeker, I want to select targets before requesting document edits, so that the agent works on the intended priorities.
35. As a job seeker, I want resumes and cover letters to consume the same checklist revision, so that they do not independently reinterpret the job.
36. As a job seeker, I want to see where a target appears in each document, so that completion is supported by an actual passage.
37. As a job seeker, I want proposed changes reviewed before replacing an existing document, so that successful generation does not overwrite my work without approval.
38. As a job seeker, I want task completion separated from evidence strength, so that finishing a preparation task cannot manufacture a qualification.
39. As a job seeker, I want deferred targets and acknowledged gaps to remain visible, so that the summary does not hide unresolved concerns.
40. As a job seeker, I want target-linked interview notes and preparation actions, so that the same analysis remains useful after submission.
41. As a job seeker, I want Company Research to inform motivation and context without becoming mandatory, so that I can prepare without an unnecessary dependency.
42. As a job seeker, I want optional cover letters treated as optional, so that preparation does not require an artifact the application does not need.
43. As a job seeker, I want document editing inside the job context, so that I can refer to targets and evidence while writing.
44. As a job seeker, I want readiness explained in concrete counts and unresolved items, so that I am not relying on a mysterious fit percentage.
45. As a job seeker, I want to mark an application submitted independently of preparation, so that the tracker reflects what actually happened.

### Control and recover work

46. As a job seeker, I want analysis to work without a completed Career Profile, so that I can understand a role before matching my experience.
47. As a job seeker, I want to inspect and maintain existing targets without an available AI provider, so that the workspace remains useful offline.
48. As a job seeker, I want clear unsupported-provider messages, so that I know which actions are available without losing existing capabilities.
49. As a job seeker, I want per-job progress, cancellation, and retry for bulk runs, so that one failure does not block successful jobs.
50. As a job seeker, I want the last valid analysis retained after a failed or cancelled run, so that experimentation cannot destroy useful work.
51. As a job seeker, I want a comparison when reanalysis changes targets, so that my reviews, notes, and deliberate decisions are preserved.
52. As a job seeker, I want document edits to invalidate affected coverage, so that an old checkmark cannot survive removal of its supporting passage.
53. As a job seeker, I want job-description and profile changes to identify affected assessments, so that I can review changes without restarting everything.
54. As a job seeker, I want the selected job, target, and view restored when I return, so that preparation can continue where I left it.
55. As a job seeker, I want keyboard navigation and accessible status labels, so that the checklist is usable without a mouse or color cues.
56. As a job seeker, I want the workspace to adapt to smaller windows, so that I can read evidence and edit documents comfortably.
57. As a job seeker, I want targets, evidence links, actions, and reviews included in local backups, so that my preparation survives a restore.
58. As an existing MuttJobs user, I want saved jobs, stages, research, and documents preserved during migration, so that the redesign does not erase prior work.
59. As an existing MuttJobs user, I want existing documents assessed on request rather than regenerated automatically, so that migration does not spend usage or change content.
60. As a downstream application agent, I want stable target identifiers and explicit evidence references, so that I can report exactly what my work addressed.
61. As a downstream application agent, I want a structured, versioned checklist contract, so that I do not depend on parsing UI prose or previous chat messages.
62. As a job seeker, I want suspicious instructions inside a posting treated as source content, so that analysis cannot be redirected into unrelated actions.
63. As a job seeker, I want uncertain or incomplete runs labeled honestly, so that a partial checklist is never presented as comprehensive.
64. As a job seeker, I want new manually supplied targets labeled separately from employer requirements, so that my personal strategy does not rewrite the posting.

## Implementation Decisions

### 1. Rebuild the job experience, preserve the platform

Replace the Job Workspace's navigation-driven progress scaffold and reorganize the Applications overview. Extend existing discovery and import entry points to route into the same target-driven flow. Preserve existing saved-job identity, application statuses, canonical editors, export controls, Career Profile, Company Research, local storage, and backup architecture. [R1][R2][R3]

This is a product and workflow rebuild, not a global application rewrite. Introduce a focused Job Workspace application service that owns the new operations and persisted aggregate. Its internal responsibilities are target analysis, evidence assessment, preparation actions, document coverage, and summary projection. UI components consume this boundary rather than duplicating domain rules.

### 2. Use one job-specific canonical checklist

Persist a **Job Target Checklist** independently of any resume or chat transcript. Associate it with the saved job ID and an immutable description revision. The same checklist feeds Targets, document preparation, evidence review, and application-agent context. Existing Job Match and tailoring entry points should consume this checklist for saved jobs rather than reconstruct a competing requirement set; compact legacy output may remain a presentation of the shared analysis.

The checklist remains candidate-independent. Store candidate assessments, document coverage, user reviews, and actions as linked records rather than embedding candidate claims into the employer's requirements. Matching a different profile revision must not redefine what the job requests.

Persist schema version, source revision, analysis revision, decoder instruction version, provider/model selection, run identity, timestamps, completeness status, and review metadata. Use opaque, app-assigned target IDs, not labels or array positions.

### 3. Define a precise target contract

Every target includes an action-oriented title, a plain-language interpretation, category, employer requirement class, application priority, inference status, rationale, source references, evidence expectations, and related targets or supporting criteria.

Categories cover technologies, architecture, delivery style, engineering quality, ownership and operations, collaboration, product/domain, business outcomes, and qualifications. Do not force a technology taxonomy onto nontechnical roles.

Requirement class distinguishes required qualification, core responsibility, preferred qualification, contextual signal, and unclear. Application priority uses Must hit, High, Medium, and Bonus. **Must hit is a preparation priority, not a claim that the employer uses a hard rejection rule.** Keep priority and confidence separate.

Grounding is Explicit, Strong inference, or Weak inference. Each inference points to the actual employer passage plus a short interpretation rationale. A model-generated paraphrase is not source evidence.

Supporting criteria preserve all-of, any-of, example-tool, and optional relationships. Track exact minimums and units where stated. Parent rollups obey those relationships and do not count the same requirement twice.

### 4. Make extraction exhaustive but conservative

Decode the full posting clause by clause, including the opening, team description, responsibilities, qualifications, and bonuses. Merge genuinely overlapping targets while preserving all supporting sources. Record a compact source-coverage ledger: passage mapped to targets, retained as role facts, or excluded as non-target boilerplate.

Retain compensation, benefits, location, work arrangement, application instructions, and accommodation/privacy information as role facts or source content, not invented competency tasks. Do not discard useful information merely because it is not a resume target.

Normalize technology spelling and aliases only for matching/display; preserve original wording. Distinguish databases, messaging, runtimes, APIs, orchestration, and cloud services rather than labeling every named technology a database.

Do not infer deployment independence or reusable frontend components solely from “loosely coupled.” Do not translate GraphQL federation into a general data-structures qualification. Do not translate ingestion of ML recommendations into a requirement to train models. Prototype work supports an iteration target, but not a certainty about sprint speed or an “MVP factory.”

Do not cap output at a fixed target count. An incomplete or truncated analysis remains explicitly incomplete. Ambiguous passages are surfaced for review, not silently resolved into the strongest possible requirement.

### 5. Introduce a job-scoped Decode Job skill and operation

Add `decode-job` through the existing local skill catalog and worker execution architecture. The job-scoped Analyze action must use a checklist output contract, not the resume-editing contract. Both Analyze and a supported explicit skill invocation should resolve to this operation; a missing saved-job context produces a clear error rather than editing an unrelated resume.

Use the existing React-to-Tauri-to-worker path, run IDs, output schemas, model/effort controls, streamed events, cancellation, and sandbox controls. Do not add a second agent runtime or migrate to App Server for this feature. Analysis does not require network access or write access to candidate documents. The application validates and persists the returned analysis. [R5][R6]

The initial local-skill execution path is Codex, matching the current catalog capability. Gate Analyze on actual capability; do not imply local skills already work with Claude Code. Preserve Claude Code's existing supported operations and allow those operations to consume a stored checklist as normal context. Stored and manually maintained checklists remain usable without AI. [R3][R5]

The existing resume guide limits mapping-mode output to 700 tokens. Explicitly scope that legacy format limit to legacy resume mapping, and exempt the new structured job-analysis contract. Preserve the guide's truth, provenance, writing, and evidence-ranking rules. A hidden prompt override or a second competing resume guide is not acceptable. [R7][R8]

### 6. Treat postings as untrusted context

Supply posting content in a clearly delimited data channel. Instructions embedded in job text cannot change tools, access other jobs, load credentials, invoke external links, change the output contract, or become candidate evidence.

Validate target structure, source references, criterion relationships, IDs, and source revision before commit. Source references contain a paragraph identifier, exact quote, and occurrence identifier within the stored source revision. Preserve original source content alongside any normalized analysis text so quotations remain auditable.

Company Research is supplementary employer context, not a replacement for the posting. Research-derived notes retain their own provenance and cannot silently become explicit JD requirements.

### 7. Match the Career Profile without inventing facts

Use the persisted Career Profile as the candidate evidence source. Link each assessment to profile revision, entry identifier, relevant field, and an exact or structured supporting excerpt. Candidate-authored corrections should be confirmed into the profile before becoming reusable evidence. Job text, Company Research, and generated resume language are not independent proof of candidate experience. [R4][R7]

Assess evidence as Unreviewed, Strong, Partial, No documented evidence, or Conflicting, with an explanation and separate user-review state. Record whether the match is direct or transferable. Strong direct evidence does not require an invented metric; the guide's numeric evidence grades may assist internal ranking, but must not masquerade as calibrated probabilities.

An analogous technology can support the broader capability while leaving a named-tool criterion uncovered. A missing profile entry means unknown or undocumented, not “the candidate definitely lacks this skill.” Never upgrade contributor scope to ownership or leadership merely to satisfy a target.

### 8. Keep four independent state dimensions

Maintain separate records for employer demand, candidate evidence, application presentation, and preparation actions. Application pipeline stage is separate again.

Evidence assessment answers whether the profile supports the target. Document coverage answers whether a particular document revision demonstrates it. Coverage states are Unreviewed, Missing, Partial, Addressed, and Needs review. Actions have To do, In progress, Blocked, Done, or Dismissed, with reasons for dismissal.

A target checkbox is checked only for reviewed Addressed coverage in the selected artifact. When a user attempts to check it, request or locate a supported placement. A manually supplied placement remains pending until verified; an unverified reference does not count as addressed. Preserve review author, time, source/evidence revisions, and artifact revision.

A reviewed gap may resolve an evidence-discovery task while the qualification remains unsupported. Deferred or dismissed work stays visible in summaries and never increases coverage. Opening tabs, finishing an agent run, or generating a document cannot mark targets addressed by itself.

### 9. Generate concrete, evidence-aware actions

Derive the worklist from targets and assessments: verify an interpretation, add missing factual detail, review an evidence match, expose existing evidence in a resume, strengthen a supported bullet, prepare an interview story, investigate an ambiguity, or acknowledge a gap.

Each action has target references, an intended artifact or destination, prerequisites, status, and a completion condition. Order work by disclosed priority rules: unresolved required qualifications first, then strong evidence missing from the application, then weaker presentation and optional differentiators. Do not imply an estimated probability increase.

Support selecting several targets for one change. One good bullet may address several requirements. The worklist must not encourage a resume with one repetitive bullet per target.

### 10. Connect document creation to target coverage

Target-guided generation receives a fixed checklist revision, selected targets, reviewed evidence references, the current document, and optional Company Research in separately labeled context. Preserve the current canonical resume and cover-letter schemas and the universal resume guide. Keep new target/evidence links in a sidecar coverage record rather than injecting unsupported fields into document JSON. [R4][R7]

For cover letters, retain the existing primary-resume authority boundary: a target or profile-only fact cannot appear as a new cover-letter claim unless it has first been appropriately incorporated into the authoritative candidate material. [R2]

Return proposed changes and target-to-document mappings. Persist new drafts as unreviewed. For an existing document, stage the proposal, show the existing review/preview affordance where available, and require acceptance before replacement. Do not assume a universal diff system already exists.

An independent coverage audit checks the saved artifact and evidence references. An agent's “addressed these targets” report is a proposal, not the final coverage state. Human review remains available because schema validation alone cannot prove semantic truth.

Optional cover-letter creation is an explicit selection. Company Research is not a prerequisite for analysis or resume preparation. A manual document path remains possible; label it as not yet target-reviewed rather than blocking application progress.

### 11. Rework the Applications overview and workspace interactions

Expose a lightweight per-job summary through the application service: analysis completeness/freshness, high-priority target counts, evidence review backlog, document coverage counts, open actions, latest run status, and the next actionable item.

Default to a sortable, filterable list; retain the existing board as another view. Preserve selection, filter, job, target, and scroll state during navigation. Use a shared summary projection for overview cards and the Job Workspace so counts cannot disagree. Count unique actionable targets, with supporting criteria shown separately; do not inflate totals by counting a parent and its children twice. Keep weak inferences distinct from explicit requirement counts.

In the Job Workspace, keep Targets prominent, with grouping by priority or category and filters for evidence/coverage/freshness. The inspector supports original-source navigation, evidence review, related criteria, notes, and scoped actions. Documents and Company Research remain contextual destinations, not numbered steps.

Use explicit empty, loading, unsupported-provider, incomplete-source, incomplete-analysis, failed, cancelled, and stale states. Status must be conveyed through text and semantics, not color alone. Keep interactions keyboard-accessible, maintain focus when opening or closing inspectors, and adapt to narrow windows without mandatory horizontal scrolling.

### 12. Define application contracts and safe persistence

Expose typed operations to read a Job Workspace, list preparation summaries, start analysis, match evidence, update reviewed targets/actions, prepare document proposals, accept proposals, audit coverage, and cancel runs. Requests use saved-job identity, run identity where applicable, and expected revisions. Result envelopes distinguish success, validation failure, source conflict, cancellation, and provider failure.

Use one versioned per-job aggregate and linked artifact records under the existing managed local storage approach. Keep model-generated analysis separate from user overrides and reviews. Preserve unknown legacy fields when updating saved jobs. Avoid introducing a new cloud database or rewriting all job ingestion types.

Commit validated results atomically through staged writes. Use optimistic revision checks so an older run cannot overwrite a newer posting, review, or document. A rejected commit leaves the previous valid state untouched and exposes the conflict.

The Applications overview reads derived summaries without loading every full profile, document, research run, and target inspector record. Summary caches are rebuildable; they are not another source of truth.

### 13. Make reanalysis and bulk operations safe

On posting changes, retain the previous checklist and mark it stale. Reanalysis creates a candidate revision. Preserve IDs for clearly unchanged targets; preserve merge/split lineage where appropriate. When identity is ambiguous, require review rather than transferring completion to a possibly different requirement.

Profile changes invalidate affected evidence assessments. Document changes invalidate affected coverage. When precise dependency detection is unavailable, mark the relevant assessment set Needs review conservatively. Never silently retain checkmarks after supporting content changes.

Bulk operations reuse the same single-job service, bounded concurrency, and visible per-job states. Selecting Analyze does not also generate documents. Cancellation prevents further queued work and late commits for that run. Retry targets failed jobs without repeating successful work unnecessarily.

Keep existing work readable throughout runs. A failed analysis does not erase a prior checklist; failed matching does not erase analysis; failed generation does not replace an existing document.

### 14. Migrate without manufacturing readiness

Migration is additive and idempotent. Keep current job IDs, source descriptions, stages, primary resumes, cover letters, research, and application metadata intact. Existing jobs begin Not analyzed. Existing documents remain available with coverage Unreviewed, not missing and not automatically addressed.

Do not convert legacy match scores into target coverage or navigation position into completion. Offer explicit Analyze existing job and Assess existing documents operations. Do not automatically launch paid discovery, research, analysis, or regeneration during migration.

Include durable checklists, evidence links, actions, reviews, overrides, and lineage in backups. Exclude credentials and temporary workspaces. Older backups without the new records restore successfully into the same Not analyzed state. Follow existing canonical-write and rollback patterns. [R3][R4]

## Testing Decisions

### Primary seam

**Proposed primary seam: the Job Workspace application boundary.** Drive the feature through the same commands the desktop uses, then inspect the returned and reloaded workspace state. This extends the existing Tauri/worker boundary instead of building a parallel test-only pipeline.

Use a deterministic provider double at the external worker boundary, a temporary local workspace, real validation and persistence, and representative saved jobs, Career Profiles, and documents. Exercise analysis, matching, reviews, proposals, acceptance, coverage, reanalysis, and migration through this one feature-level boundary. Thin adapters and internal helpers are not separate acceptance seams.

A good test asserts externally meaningful behavior: correct targets and provenance; preserved alternatives; truthful evidence linkage; explainable actions; correct review state; retained data after failure; and consistent summaries. It does not assert private helper calls, component state layout, exact prompt wording, model prose, or an arbitrary number of targets.

### Existing testing foundations

Current primary-resume generation tests include temporary-directory persistence checks and rollback behavior, together with context-boundary checks. Current Company Research UI tests distinguish running, validating, completed, and failed states and verify retry behavior. Reuse those conventions for persistence and observable state transitions. Do not make exact prompt-string assertions the principal proof of this feature. [R4][R9]

No product tests were executed while writing this specification. The following are proposed implementation acceptance tests, not reported results.

### Behavioral acceptance cases

1. **Chewy extraction:** Opening an analyzed Chewy job yields separately assessable full-stack, iterative development/testing, prototype deployment, distributed-system, event-driven, GraphQL, operational ownership, collaboration, and product-context targets, with supporting source references.
2. **No false requirements:** React/Vue/Angular remains an alternative group; degree-or-equivalent remains an alternative; bonus tools remain preferred; unstated metrics, React preference, model training, and fixed MVP delivery speed are not invented.
3. **Source completeness:** Every substantive hiring passage maps to a target or a recorded non-target classification. An incomplete source or truncated model response cannot produce a Complete analysis.
4. **Grounding validation:** An output with an invalid quote, wrong source revision, unsupported reference, duplicate ID, or invalid criterion relationship is rejected without replacing valid analysis.
5. **Candidate independence:** Analyzing the same source with no Career Profile still produces a usable checklist. Candidate strengths cannot alter employer requirements.
6. **Evidence integrity:** Job text, research, and generated prose cannot satisfy candidate evidence. Transferable experience remains labeled transferable; missing profile content remains undocumented rather than confirmed absence.
7. **Honest checkboxes:** Navigation, successful analysis, evidence review, document generation, acknowledged gaps, and dismissed tasks do not independently create Addressed coverage.
8. **Presentation gap:** Strong profile evidence absent from the resume produces an actionable presentation task, not a claim that the user lacks the skill.
9. **Document safety:** Unsupported target requests cannot introduce facts. Rejecting an edit preserves the current document; accepting a validated proposal records its actual target placements and revision.
10. **Freshness:** Removing a supporting passage or changing relevant source/profile content invalidates affected coverage or evidence. Unrelated state is retained where dependencies are known.
11. **Reanalysis lineage:** Unchanged targets retain reviews; removed targets remain historically traceable; ambiguous merge/split mappings cannot inherit completion automatically.
12. **Failure and concurrency:** Cancellation, provider errors, invalid output, interrupted writes, and stale run completions preserve the last valid state and expose actionable error information.
13. **Migration and restore:** Existing jobs, documents, research, and stages survive migration and backup round trips; legacy scores do not become coverage; old backups remain readable.
14. **Bulk isolation:** One failed job does not invalidate successful jobs. Retry does not duplicate successful commits. Opening the overview does not launch analysis or spend discovery credits.
15. **Shared projections:** Applications and the Job Workspace display the same counts and next action for the same persisted revisions. Deferred items remain visible and excluded from addressed counts.
16. **Capability boundaries:** Unavailable local-skill support yields a clear capability message while manual review and existing provider-supported document operations remain usable.
17. **Injection resistance:** A posting containing tool instructions, fake candidate claims, or demands to inspect unrelated files cannot escape its data role or change unrelated workspace state.
18. **Interaction behavior:** A small UI integration suite verifies default Targets navigation, original-source inspection, target selection, document review, back-navigation restoration, keyboard focus, and narrow-window operation through the same application contract.

### Model quality and evaluation

Deterministic tests prove the product contract, not the quality of a real model's interpretation. Maintain a separate, explicit evaluation set with annotated hiring passages, expected requirement relationships, and prohibited inferences. Include Chewy, a non-engineering role, sparse postings, verbose/repetitive postings, contradictory requirements, and adversarial input.

Evaluate missed important targets, fabricated requirements, unsupported candidate claims, quote validity, inappropriate splitting/merging, and whether suggested actions follow from real evidence. Accept equivalent target wording and grouping where meaning is preserved. The curated acceptance fixtures must retain all annotated high-priority explicit asks and contain no fabricated candidate claims; broader evaluation reports failures rather than implying universal accuracy.

### Delivery acceptance

The redesign is not complete when a checklist can be generated. It is complete when a user can enter a saved job, inspect its targets and evidence, prepare a supported document, see its reviewed coverage, return through Applications without losing context, and resume after restart or a failed run. Existing jobs and documents must remain intact throughout.

## Out of Scope

This specification does not introduce automatic application submission, recruiter outreach, interview scheduling, or a new CRM. It does not guarantee interviews, estimate hiring probabilities, or invent a universal ATS score.

It does not replace TheirStack, build a new search crawler, redesign the Career Profile or document rendering engine wholesale, introduce a cloud backend, migrate the agent runtime, or add local-skill support to every provider.

A full interview simulator, course recommendations, project-building automation, and an autonomous system for filling skill gaps are excluded. Target-linked preparation actions and notes are included; completing a note is not proof of acquiring a skill.

Company-wide architecture reconstruction beyond the posting is excluded from Decode Job. Company Research remains a separate, explicitly invoked capability. Compensation, legal, and eligibility facts may be preserved, but this feature does not make legal determinations or infer protected characteristics.

Pixel-exact mockups and implementation code are not part of this specification. The interaction model, data boundaries, migration requirements, and acceptance behaviors are.

## Further Notes

### Chewy interpretation guardrails

The Chewy posting supplied in this conversation is a source fixture, not verification that the position is still open. It demonstrates how this design must handle different kinds of signal:

- **Iterative development and testing:** extract both the delivery process and validation expectation. Do not invent sprint length or release frequency.
- **Frontend and backend:** preserve the full-stack request and separately assess relevant frontend and service-development evidence.
- **Loosely coupled components:** target modular boundaries; label reuse and deployment-independence interpretations as unconfirmed when not stated.
- **Real-time events and self-corrective processes:** retain the explicit customer-facing reliability signal; keep the precise recovery mechanism unknown.
- **Federated GraphQL:** target API/schema composition and integration, without treating it as independent proof of an algorithmic requirement.
- **ML/recommendation ingestion:** target integration or data pipelines, not model-training experience.
- **Prototype creation and deployment:** target concept-to-deployment work, with iteration as a supported interpretation rather than a guaranteed pace.
- **Standardization, optimization, automation, and infrastructure:** preserve these as independently assessable responsibilities, not one vague “DevOps” keyword.
- **Autoship's customer and subscription context:** suggest truthful recurring-workflow or customer-lifecycle analogues, never rename unrelated employment as e-commerce experience.
- **Required and bonus qualifications:** retain the posting's distinctions. A tool mentioned in the environment and again under Bonus must not silently become a hard gate.

The example coverage percentages and candidate claims discussed earlier were illustrations, not verified assessments. They must not be imported as facts or used to pre-check this user's targets.

### Delivery sequence

Implement in vertical slices: first the canonical target contract and Analyze-to-persist workflow; then the new Targets-first Job Workspace with evidence review; then target-guided documents and coverage; then overview projections, bulk actions, and migration/restore hardening. The release scope remains the complete job-section rework, not a standalone analysis panel.

Measure extraction quality and the time/work needed to reach a reviewed application before choosing improvement targets. Do not invent product-performance gains or reduce success to the number of generated documents.

### Repository and publication notes

Use the established terms Career Profile, Applications, Job Workspace, primary resume, Company Research, and local skills. No separate domain glossary or ADR was identified in the inspected material; implementation should recheck repository instructions and architectural decisions on the actual branch before making changes.

The issue-tracker destination and project triage setup were not established. No issue or label was created. Run `/setup-matt-pocock-skills` to configure publication. Linear is excluded for this work.

### Repository evidence

The following references identify the inspected baseline; implementation decisions above are proposals unless explicitly described as current behavior.

[R1] [Current Job Workspace navigation, content, and progress behavior](https://github.com/Gohostieee/MuttJobs/blob/9247b6e2cde2e5da8974760227e8f043e485e00d/src/components/job-workspace.tsx).

[R2] [Applications overview, bulk operations, and cover-letter evidence boundary](https://github.com/Gohostieee/MuttJobs/blob/9247b6e2cde2e5da8974760227e8f043e485e00d/src/components/applications-workspace.tsx).

[R3] [MuttJobs product vocabulary, local-first storage, backups, and provider capabilities](https://github.com/Gohostieee/MuttJobs/blob/9247b6e2cde2e5da8974760227e8f043e485e00d/README.md).

[R4] [Career Profile generation, staging, evidence separation, and persistence tests](https://github.com/Gohostieee/MuttJobs/blob/9247b6e2cde2e5da8974760227e8f043e485e00d/src-tauri/src/providers/profile_resume.rs).

[R5] [Current local skill catalog and managed installation behavior](https://github.com/Gohostieee/MuttJobs/blob/9247b6e2cde2e5da8974760227e8f043e485e00d/src-tauri/src/providers/skills.rs).

[R6] [Existing worker request, output-schema, execution, and cancellation contract](https://github.com/Gohostieee/MuttJobs/blob/9247b6e2cde2e5da8974760227e8f043e485e00d/agent-worker/src/protocol.ts).

[R7] [Universal resume guide: truth rules, mapping contract, and evidence ranking](https://github.com/Gohostieee/MuttJobs/blob/9247b6e2cde2e5da8974760227e8f043e485e00d/resume-guide.md).

[R8] [Existing read-only Job Match skill boundary](https://github.com/Gohostieee/MuttJobs/blob/9247b6e2cde2e5da8974760227e8f043e485e00d/src-tauri/resources/default-skills/job-match/SKILL.md).

[R9] [Existing observable Company Research state and retry tests](https://github.com/Gohostieee/MuttJobs/blob/9247b6e2cde2e5da8974760227e8f043e485e00d/src/lib/company-research-ui.test.ts).
