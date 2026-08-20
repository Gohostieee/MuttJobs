const NARRATIVE_FIELDS = [
  "response",
  "executiveSummary",
  "reportMarkdown",
  "summary",
] as const

/**
 * Agent providers stream structured output through the same agent-message
 * channel as ordinary prose. Keep the schema envelope out of the transcript
 * and render the user-facing narrative instead.
 */
export function formatAgentMessage(value: string): string | null {
  const text = value.trim()
  if (!text) return null

  const parsed = parseStructuredObject(text)
  if (parsed) {
    for (const field of NARRATIVE_FIELDS) {
      const narrative = parsed[field]
      if (typeof narrative === "string" && narrative.trim()) return narrative.trim()
    }

    return null
  }

  // Structured output can be incomplete while an item.updated event is still
  // arriving. Do not briefly expose the provider's JSON envelope as prose.
  if (/^(?:```(?:json)?\s*)?[\[{]/i.test(text)) return null
  return value
}

function parseStructuredObject(value: string): Record<string, unknown> | null {
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]
  for (const candidate of fenced ? [value, fenced] : [value]) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // The provider may still be streaming an incomplete structured value.
    }
  }

  return null
}
