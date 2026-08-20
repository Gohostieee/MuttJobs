import assert from "node:assert/strict"
import test from "node:test"

import {
  canRetryCompanyResearchAgent,
  companyResearchAgentPanelMode,
  companyResearchRunCounts,
} from "./company-research-ui.ts"

test("partial success counts completed and failed agents independently", () => {
  assert.deepEqual(
    companyResearchRunCounts(["completed", "completed", "completed", "completed", "timed_out"]),
    { completed: 4, terminal: 5 },
  )
})

test("running and validating agents retain their live activity panel", () => {
  assert.equal(companyResearchAgentPanelMode("running", false), "active")
  assert.equal(companyResearchAgentPanelMode("validating", false), "active")
})

test("completed reports remain readable and failed agents expose retry", () => {
  assert.equal(companyResearchAgentPanelMode("completed", true), "report")
  assert.equal(companyResearchAgentPanelMode("failed", false), "error")
  assert.equal(canRetryCompanyResearchAgent("failed"), true)
  assert.equal(canRetryCompanyResearchAgent("timed_out"), true)
  assert.equal(canRetryCompanyResearchAgent("completed"), false)
})
