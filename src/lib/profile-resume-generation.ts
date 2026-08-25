import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type { AgentProviderId } from "@/lib/agent-providers"
import type { ResumeAiStreamEvent } from "@/lib/resume-ai"
import { normalizeAndValidateResume } from "@/lib/resume-validation"
import type { ResumeFile } from "@/lib/resume-types"
import type { JobPrimaryResume } from "@/lib/theirstack"

export type GeneratePrimaryResumeFromProfileRequest = {
  runId: string
  jobId: number
  provider?: AgentProviderId
  model?: string
  effort?: string
}

export type GeneratePrimaryResumeFromProfileResult = {
  primaryResume: JobPrimaryResume
  file: ResumeFile
  response: string
  changed: boolean
}

type GenerationEventEnvelope = {
  jobId: string
  event: ResumeAiStreamEvent
}

export async function generatePrimaryResumeFromProfile(
  request: GeneratePrimaryResumeFromProfileRequest,
  onEvent?: (event: ResumeAiStreamEvent) => void,
): Promise<GeneratePrimaryResumeFromProfileResult> {
  const unlisten = onEvent
    ? await listen<GenerationEventEnvelope>("primary-resume-generation-event", (event) => {
        if (
          event.payload.jobId === request.runId
          || event.payload.jobId === `${request.runId}-correction`
        ) onEvent(event.payload.event)
      })
    : null

  try {
    const value = await invoke<unknown>("generate_primary_resume_from_profile", { request })
    return normalizeGenerationResult(value)
  } finally {
    unlisten?.()
  }
}

export function createPrimaryResumeGenerationRunId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `profile-resume-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeGenerationResult(value: unknown): GeneratePrimaryResumeFromProfileResult {
  const source = asRecord(value)
  const primaryResume = asRecord(source.primaryResume)
  const file = asRecord(source.file)
  return {
    primaryResume: {
      sourceFileName: requiredString(primaryResume.sourceFileName, "profile.json"),
      jobResumeFileName: requiredString(primaryResume.jobResumeFileName, "primary-resume.json"),
      selectedAt: requiredString(primaryResume.selectedAt, new Date().toISOString()),
    },
    file: {
      id: requiredString(file.id, `job-primary-${Date.now()}`),
      fileName: requiredString(file.fileName, "primary-resume.json"),
      path: requiredString(file.path, ""),
      updatedAt: typeof file.updatedAt === "number" ? file.updatedAt : 0,
      data: normalizeAndValidateResume(file.data),
    },
    response: typeof source.response === "string" ? source.response : "Primary resume created.",
    changed: source.changed === true,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new Error("The primary resume generator returned an invalid result.")
}

function requiredString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback
}
