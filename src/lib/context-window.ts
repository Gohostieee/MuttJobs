function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

type NullableContextWindowUsage = {
  readonly usedTokens: number
  readonly totalProcessedTokens: number | null
  readonly maxTokens: number | null
  readonly inputTokens: number | null
  readonly cachedInputTokens: number | null
  readonly outputTokens: number | null
  readonly reasoningOutputTokens: number | null
  readonly lastUsedTokens: number | null
  readonly lastInputTokens: number | null
  readonly lastCachedInputTokens: number | null
  readonly lastOutputTokens: number | null
  readonly lastReasoningOutputTokens: number | null
  readonly toolUses: number | null
  readonly durationMs: number | null
  readonly compactsAutomatically: boolean
}

export type ContextWindowSnapshot = NullableContextWindowUsage & {
  readonly remainingTokens: number | null
  readonly usedPercentage: number | null
  readonly remainingPercentage: number | null
  readonly updatedAt: string
}

/**
 * Find the newest valid Codex usage payload. A malformed event must not hide
 * an earlier usable snapshot, which mirrors T3 Code's activity projection.
 */
export function deriveLatestContextWindowSnapshot(
  usages: ReadonlyArray<unknown>,
): ContextWindowSnapshot | null {
  for (let index = usages.length - 1; index >= 0; index -= 1) {
    const payload = asRecord(usages[index])
    const usedTokens = asFiniteNumber(payload?.usedTokens)
    if (usedTokens === null || usedTokens < 0) {
      continue
    }

    const maxTokens = asFiniteNumber(payload?.maxTokens)
    const usedPercentage =
      maxTokens !== null && maxTokens > 0 ? Math.min(100, (usedTokens / maxTokens) * 100) : null
    const remainingTokens =
      maxTokens !== null ? Math.max(0, Math.round(maxTokens - usedTokens)) : null
    const remainingPercentage = usedPercentage !== null ? Math.max(0, 100 - usedPercentage) : null

    return {
      usedTokens,
      totalProcessedTokens: asFiniteNumber(payload?.totalProcessedTokens),
      maxTokens,
      remainingTokens,
      usedPercentage,
      remainingPercentage,
      inputTokens: asFiniteNumber(payload?.inputTokens),
      cachedInputTokens: asFiniteNumber(payload?.cachedInputTokens),
      outputTokens: asFiniteNumber(payload?.outputTokens),
      reasoningOutputTokens: asFiniteNumber(payload?.reasoningOutputTokens),
      lastUsedTokens: asFiniteNumber(payload?.lastUsedTokens),
      lastInputTokens: asFiniteNumber(payload?.lastInputTokens),
      lastCachedInputTokens: asFiniteNumber(payload?.lastCachedInputTokens),
      lastOutputTokens: asFiniteNumber(payload?.lastOutputTokens),
      lastReasoningOutputTokens: asFiniteNumber(payload?.lastReasoningOutputTokens),
      toolUses: asFiniteNumber(payload?.toolUses),
      durationMs: asFiniteNumber(payload?.durationMs),
      compactsAutomatically: asBoolean(payload?.compactsAutomatically) ?? false,
      updatedAt: typeof payload?.updatedAt === "string" ? payload.updatedAt : "",
    }
  }

  return null
}

export function formatContextWindowTokens(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "0"
  }
  if (value < 1_000) {
    return `${Math.round(value)}`
  }
  if (value < 10_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  }
  if (value < 1_000_000) {
    return `${Math.round(value / 1_000)}k`
  }
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
}
