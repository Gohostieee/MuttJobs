import assert from "node:assert/strict"
import test from "node:test"

import { formatAgentMessage } from "./agent-message.ts"

test("extracts and formats the narrative from a structured agent response", () => {
  assert.equal(
    formatAgentMessage('{"actions":[],"response":"Found jobs:\\n\\n- Engineer"}'),
    "Found jobs:\n\n- Engineer",
  )
})

test("uses research narrative fields instead of dumping the report envelope", () => {
  assert.equal(
    formatAgentMessage('{"executiveSummary":"The company is growing.","reportMarkdown":"# Full report"}'),
    "The company is growing.",
  )
})

test("keeps ordinary Markdown and hides unknown structured output", () => {
  assert.equal(formatAgentMessage("## Search results\n\n- Engineer"), "## Search results\n\n- Engineer")
  assert.equal(formatAgentMessage('{"actions":[],"metadata":{"turn":1}}'), null)
  assert.equal(formatAgentMessage('{"response":"still streaming"'), null)
})

test("accepts a fenced JSON envelope from providers that add a code fence", () => {
  assert.equal(
    formatAgentMessage('```json\n{"response":"Done."}\n```'),
    "Done.",
  )
})
