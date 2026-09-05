# Target workspace validation

Implementation baseline: `567fe611a19b4235bacab2d68bbbf71b367cf52f`. Work is committed locally on `main`; no push is part of this delivery.

## Deterministic correctness

- Frontend tests: **40 passed**.
- Rust tests: **117 passed**, two intentionally ignored entrypoints (live evaluation and the browser fixture server).
- Browser integration: **6 passed** against the real Rust application service, temporary storage, and a deterministic worker transport.
- Frontend and worker TypeScript checks: **passed**.
- Desktop build: **passed**, including the packaged worker, production frontend, and optimized native executable at `src-tauri/target/release/muttjobs.exe` (`tauri build --no-bundle`).

The feature tests exercise returned and reloaded workspaces, actual canonical schemas, source quotation validation, evidence ownership, revision checks, and real filesystem transactions. Browser fixtures replace the external worker and desktop transport, not the application service. The browser suite covers default navigation, persistent source access, evidence review, proposal acceptance, separate criterion/coverage review, restart restoration, keyboard focus, an 800px drawer, list/board projection consistency, and stale editor saves.

## Acceptance coverage

| Spec case | Evidence and limit |
|---|---|
| 1. Chewy extraction | Locally saved posting retained as an annotated fixture. Live extraction has timed out; semantic acceptance is **not established**. |
| 2. Alternatives and false requirements | Service test preserves an any-of framework group; criterion review requires a supported alternative. Curated live fixtures separately check annotated passages and prohibited inferences. |
| 3. Source completeness | Missing ledger entries cannot be Complete; source correction retains original text; incomplete analysis remains labeled. Detecting semantic incompleteness still depends on model/user review. |
| 4. Grounding | Invalid quotes, occurrences, source revisions, IDs, relationships, and ledger mappings reject persistence. |
| 5. Candidate independence | Analysis worker input contains source passages only, even with a populated profile. |
| 6. Evidence integrity | Entry ownership, exact field excerpts, revisions, support strength, and confirmation are distinct. Posting text cannot substitute for profile references. |
| 7. Honest checkboxes | Matching, task completion, proposal generation, and acceptance do not address targets. Saved passages, current confirmed evidence, and criterion review are required. |
| 8. Presentation gaps | Confirmed evidence produces a document action; generated actions resolve when their actual linked conditions are satisfied. |
| 9. Document safety | Unsupported mappings fail; rejection preserves bytes; acceptance commits canonical content and sidecars together. Human review remains responsible for the meaning of candidate claims. |
| 10. Freshness | Source, profile, artifact, target interpretation, and cover-letter primary-resume dependencies invalidate affected reviews/proposals. |
| 11. Lineage | Unchanged identities retain reviews; reanalysis is staged; merge/split children retain source lineage without inherited completion. |
| 12. Failure/concurrency | Cancellation, provider failure, stale completions, interrupted canonical writes, partial unpublished journals, replayed run IDs, and stale editor saves are covered. |
| 13. Migration/restore | Additive managed aggregates, real archive round trip, retained original metadata, legacy schema tests, and transient-file exclusions pass. |
| 14. Bulk isolation | Independent job failure and successful-run replay are service-tested. UI bulk execution uses two workers with cancellation and failed-only retry. |
| 15. Shared projections | Workspace/list/board use persisted preparation summaries; browser checks compare counts. |
| 16. Capabilities | Analyze rejects unsupported providers; manual targets remain available; ordinary Claude edits can be proposed and accepted without analysis or against a stale posting. |
| 17. Injection resistance | Adversarial input stays inside the source data boundary; worker execution disables unrelated tools/network access. Deterministic state integrity and live interpretation are reported separately. |
| 18. Interaction | Six browser tests pass, including narrow-window focus and restoration. |

## Standards review

Two independent review agents inspected the implementation against the fixed baseline. No documented coding-standard breach was found. The standards review identified journal publication, cover-letter authority, run replay, metadata preservation, and editor concurrency issues. Those were fixed and regression-tested. The frontend mutation contract now uses typed payloads. Final focused verification reported **no remaining actionable finding**.

## Specification review

The specification review identified ordinary Claude-edit compatibility, stale dependencies, generated action reconciliation, transaction safety, and optimistic editor saves. These were fixed. An additional Quantify impact concern was withdrawn after checking its existing read-only validator. Final focused verification reported **no remaining actionable finding**. This does not override the separate live Chewy evaluation failure.

## Live model evaluation

Every attempt used **gpt-5.6-luna / max**, with `model_reasoning_effort = "max"` passed through the SDK configuration override. No model or effort substitution occurred. A short connectivity request succeeded. The first complete six-fixture run passed sparse and repetitive examples, timed out on Chewy and non-engineering, and rejected invalid criteria in contradictory/adversarial output. The criteria schema and instructions were then tightened and all fixtures rerun.

The latest outcomes across the full run and focused retests are recorded in [evaluation-2026-09-05.json](../tests/fixtures/job-workspace/evaluation-2026-09-05.json):

| Fixture | Latest result |
|---|---|
| Chewy | Timeout after 600 seconds; no accepted analysis |
| Non-engineering | Passed annotated checks |
| Sparse | Passed; visibly incomplete |
| Repetitive | Passed annotated checks; overlapping API target grouping still merits user review |
| Contradictory | Passed focused retest after conservative completeness handling |
| Adversarial | Passed focused retest; injected instructions remain source data |

The final completeness change prevents any provider warning from being hidden behind a Complete label. **Five of six fixtures pass the bounded checks; full live-model quality acceptance remains unmet.** Numeric normalization and grouping are still review responsibilities; for example, the non-engineering output retained “one year” in its alternatives but left the numeric minimum null.

Automated passage/forbidden-term checks are not proof of universal semantic accuracy. Native installed-app interaction was not exercised; browser verification uses the same application service.
