import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type { ResumeAiJobOptions, ResumeAiResult, ResumeAiSelection, ResumeAiStreamEvent } from "@/lib/resume-ai"
import type { CoverLetterData } from "@/lib/cover-letter-types"
import { normalizeAndValidateCoverLetter } from "@/lib/cover-letter-validation"

export type CoverLetterAiResult = Omit<ResumeAiResult, "data"> & { data: CoverLetterData }

type StreamEnvelope = { jobId: string; event: ResumeAiStreamEvent }

export async function runCoverLetterAiJob(
  path: string,
  prompt: string,
  selection?: ResumeAiSelection,
  options?: ResumeAiJobOptions,
): Promise<CoverLetterAiResult> {
  const jobId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `cover-letter-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const unlisten = options?.onEvent
    ? await listen<StreamEnvelope>("cover-letter-ai-event", (event) => {
        if (event.payload.jobId === jobId) options.onEvent?.(event.payload.event)
      })
    : null

  try {
    const value = await invoke<unknown>("run_cover_letter_ai_job", {
      path,
      prompt,
      provider: selection?.provider,
      model: selection?.model,
      effort: selection?.effort,
      jobId,
      skills: options?.skillNames,
      targetJobId: options?.targetJobId,
      targetResumeId: options?.targetResumeId,
      selection: options?.textSelection,
      selectionAction: options?.selectionAction,
    })
    const source = asRecord(value)
    return {
      data: normalizeAndValidateCoverLetter(source.data),
      response: typeof source.response === "string" ? source.response : "Cover letter update completed.",
      changed: source.changed === true,
    }
  } finally {
    unlisten?.()
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  throw new Error("The selected agent returned an invalid cover letter update.")
}
