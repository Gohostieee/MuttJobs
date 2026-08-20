import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type { AgentProviderId } from "@/lib/agent-providers"
import { normalizeAndValidateResume } from "@/lib/resume-validation"
import type { ResumeData } from "@/lib/resume-types"
import type { ResumeSelectionAction, ResumeTextSelection } from "@/lib/resume-selection"

export type ResumeAiResult = {
  data: ResumeData
  response: string
  changed: boolean
}

export type ResumeAiItem = Record<string, unknown>

export type ResumeAiStreamEvent =
  | { type: "thread"; threadId: string }
  | { type: "progress"; stage: string }
  | {
      type: "item"
      id: string
      kind: string
      status: string
      eventType: string
      item: ResumeAiItem | null
    }
  | { type: "usage"; usage: Record<string, unknown> }

type ResumeAiStreamEnvelope = {
  jobId: string
  event: ResumeAiStreamEvent
}

export type ResumeAiSelection = {
  provider: AgentProviderId
  model: string
  effort: string
}

export type ResumeAiJobOptions = {
  skillNames?: string[]
  targetJobId?: number
  targetResumeId?: string
  textSelection?: ResumeTextSelection
  selectionAction?: ResumeSelectionAction
  onEvent?: (event: ResumeAiStreamEvent) => void
}

export async function runResumeAiJob(
  path: string,
  prompt: string,
  selection?: ResumeAiSelection,
  options?: ResumeAiJobOptions,
): Promise<ResumeAiResult> {
  const jobId = createJobId()
  const unlisten = options?.onEvent
    ? await listen<ResumeAiStreamEnvelope>("resume-ai-event", (event) => {
        if (event.payload.jobId === jobId) options.onEvent?.(event.payload.event)
      })
    : null

  try {
    const value = await invoke<unknown>("run_resume_ai_job", {
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
    const data = normalizeAndValidateResume(source.data)
    return {
      data,
      response: typeof source.response === "string" ? source.response : "Resume update completed.",
      changed: source.changed === true,
    }
  } finally {
    unlisten?.()
  }
}

function createJobId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `resume-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new Error("The selected agent returned an invalid resume update.")
}
