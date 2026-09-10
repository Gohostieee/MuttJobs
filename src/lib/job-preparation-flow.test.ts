import { strict as assert } from "node:assert"
import { test } from "node:test"
import { requirementConfirmed } from "./job-preparation-flow.ts"
import type { JobPreparation, Target } from "./job-workspace"

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
