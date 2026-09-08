import { listen } from "@tauri-apps/api/event"
import type { ResumeAiStreamEvent } from "./resume-ai"
import { runInBackground } from "./background-activity"
import { invoke } from "@tauri-apps/api/core"

import type { ResumeAiSelection } from "@/lib/resume-ai"

export type ResumeMatchDimensionScores = {
  roleAlignment: number
  relevantExperience: number
  skillsTechnology: number
  seniorityScope: number
  companyContext: number
  evidenceClarity: number
}

export type ResumeMatchEntry = {
  rank: number
  resumeId: string
  fileName: string
  score: number
  categoryScores: ResumeMatchDimensionScores
  summary: string
  reasons: string[]
  gaps: string[]
}

export type ResumeMatchingResult = {
  schemaVersion: number
  runId: string
  jobId: number
  generatedAt: string
  provider: string
  model: string
  effort: string
  researchRunId?: string | null
  matches: ResumeMatchEntry[]
}

export type StartResumeMatchingRequest = {
  runId: string
  jobId: number
  provider: ResumeAiSelection["provider"]
  model: string
  effort: string
}

export const startResumeMatching = (request: StartResumeMatchingRequest) =>
  runInBackground(`resume-matching-${request.jobId}`, "Resume matching", async (onEvent) => {
    const unlisten = await listen<{ runId: string; event: ResumeAiStreamEvent }>("resume-matching-event", ({ payload }) => {
      if (payload.runId === request.runId) onEvent(payload.event)
    })
    try { return await invoke<ResumeMatchingResult>("start_resume_matching", { request }) }
    finally { unlisten() }
  })

export function createResumeMatchingRunId() {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `resume-matching-${suffix}`
}
