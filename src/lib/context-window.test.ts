import assert from "node:assert/strict"
import test from "node:test"

import {
  deriveLatestContextWindowSnapshot,
  formatContextWindowTokens,
} from "./context-window.ts"

test("derives the latest valid context window snapshot", () => {
  const snapshot = deriveLatestContextWindowSnapshot([
    { usedTokens: 1_000 },
    { usedTokens: 14_000, maxTokens: 258_400, compactsAutomatically: true },
  ])

  assert.deepEqual(snapshot, {
    usedTokens: 14_000,
    totalProcessedTokens: null,
    maxTokens: 258_400,
    remainingTokens: 244_400,
    usedPercentage: (14_000 / 258_400) * 100,
    remainingPercentage: 100 - (14_000 / 258_400) * 100,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningOutputTokens: null,
    lastUsedTokens: null,
    lastInputTokens: null,
    lastCachedInputTokens: null,
    lastOutputTokens: null,
    lastReasoningOutputTokens: null,
    toolUses: null,
    durationMs: null,
    compactsAutomatically: true,
    updatedAt: "",
  })
})

test("ignores malformed payloads without hiding an earlier valid snapshot", () => {
  const snapshot = deriveLatestContextWindowSnapshot([
    { usedTokens: 2_000, maxTokens: 100_000 },
    { usedTokens: -1 },
    { usedTokens: "not-a-number" },
  ])

  assert.equal(snapshot?.usedTokens, 2_000)
  assert.equal(snapshot?.remainingTokens, 98_000)
})

test("keeps valid zero-usage snapshots", () => {
  const snapshot = deriveLatestContextWindowSnapshot([
    { usedTokens: 0, maxTokens: 100_000 },
  ])

  assert.deepEqual(snapshot && {
    usedTokens: snapshot.usedTokens,
    remainingTokens: snapshot.remainingTokens,
    usedPercentage: snapshot.usedPercentage,
    remainingPercentage: snapshot.remainingPercentage,
  }, {
    usedTokens: 0,
    remainingTokens: 100_000,
    usedPercentage: 0,
    remainingPercentage: 100,
  })
})

test("formats compact token counts", () => {
  assert.equal(formatContextWindowTokens(999), "999")
  assert.equal(formatContextWindowTokens(1_400), "1.4k")
  assert.equal(formatContextWindowTokens(14_000), "14k")
  assert.equal(formatContextWindowTokens(258_400), "258k")
})
