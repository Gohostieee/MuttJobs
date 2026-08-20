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
  invoke<ResumeMatchingResult>("start_resume_matching", { request })

export function createResumeMatchingRunId() {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `resume-matching-${suffix}`
}
