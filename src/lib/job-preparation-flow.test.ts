import { strict as assert } from "node:assert"
import { test } from "node:test"
import { requirementConfirmed, targetProgress } from "./job-preparation-flow.ts"
import type { Evidence, JobPreparation, Target } from "./job-workspace"

const target: Target = {
  id: "t1",
  title: "Build services",
  interpretation: "Build reliable services",
  category: "architecture",
  requirementClass: "Core responsibility",
  priority: "High",
  grounding: "Explicit",
  rationale: "The employer asks for this",
  sources: [
    { paragraphId: "p1", quote: "Build reliable services", occurrence: 0 },
  ],
  evidenceExpectations: [],
  criteria: [],
}
function workspace(): JobPreparation {
  return {
    source: { revision: "source-1" },
    confirmedTargets: { t1: { sourceRevision: "source-1", target } },
    evidence: [],
    coverage: [],
  } as unknown as JobPreparation
}
function evidence(review: string, strength = "Strong"): Evidence {
  return {
    id: "e1",
    profileRevision: "p1",
    review,
    reviewedAt: null,
    suggestion: {
      targetId: "t1",
      strength,
      matchKind: "Direct",
      explanation: "A match",
      references:
        strength === "No documented evidence"
          ? []
          : [
              {
                entryId: "x",
                field: "/description",
                excerpt: "Built services",
              },
            ],
    },
  }
}

test("confirmations survive JSON key ordering but expire after source or requirement edits", () => {
  const w = workspace()
  const reordered = Object.fromEntries(
    Object.entries(target).reverse(),
  ) as Target
  assert.equal(requirementConfirmed(w, reordered), true)
  assert.equal(
    requirementConfirmed(w, { ...target, title: "A different requirement" }),
    false,
  )
  w.source.revision = "source-2"
  assert.equal(requirementConfirmed(w, target), false)
  delete w.confirmedTargets
  assert.equal(requirementConfirmed(w, target), false)
})

test("matching, evidence approval, and document coverage have distinct task states", () => {
  const w = workspace()
  assert.equal(targetProgress(w, target).status, "Ready to match")
  w.evidence = [evidence("Unreviewed")]
  assert.equal(targetProgress(w, target).status, "Review suggested evidence")
  assert.equal(targetProgress(w, target).approved, false)
  w.evidence[0].review = "Confirmed"
  assert.equal(targetProgress(w, target).status, "Ready for document")
  assert.equal(targetProgress(w, target).addressed, false)
  w.evidence[0].review = "Needs review"
  assert.equal(
    targetProgress(w, target).status,
    "Evidence needs another review",
  )
  assert.equal(targetProgress(w, target).supported, true)
  assert.equal(targetProgress(w, target).approved, false)
})

test("rejected and unsupported matches never become approved evidence", () => {
  const w = workspace()
  for (const e of [
    evidence("Rejected"),
    evidence("Unreviewed", "No documented evidence"),
    evidence("Confirmed", "Conflicting"),
  ]) {
    w.evidence = [e]
    const state = targetProgress(w, target)
    assert.equal(state.status, "Add profile details")
    assert.equal(state.supported, false)
    assert.equal(state.approved, false)
  }
})
