import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type { ResumeAiSelection, ResumeAiStreamEvent } from "@/lib/resume-ai"

export type GeneralAgentMessage = {
  role: "user" | "assistant"
  content: string
}

export type GeneralAgentToolCall = {
  tool: "getAllJobs" | "getJob" | "researchCompany"
  label: string
  status: "completed" | "failed"
  result: unknown
}

export type GeneralAgentResult = {
  response: string
  toolCalls: GeneralAgentToolCall[]
}

type GeneralAgentStreamEnvelope = {
  jobId: string
  event: ResumeAiStreamEvent
}

export async function runGeneralAgentJob(
  messages: GeneralAgentMessage[],
  selection: ResumeAiSelection,
  onEvent?: (event: ResumeAiStreamEvent) => void,
): Promise<GeneralAgentResult> {
  const jobId = createJobId()
  const unlisten = onEvent
    ? await listen<GeneralAgentStreamEnvelope>("general-agent-event", (event) => {
        if (event.payload.jobId === jobId) onEvent(event.payload.event)
      })
    : null

  try {
    return await invoke<GeneralAgentResult>("run_general_agent_job", {
      request: {
        jobId,
        messages,
        provider: selection.provider,
        model: selection.model,
        effort: selection.effort,
      },
    })
  } finally {
    unlisten?.()
  }
}

function createJobId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `general-agent-${crypto.randomUUID()}`
  }
  return `general-agent-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
