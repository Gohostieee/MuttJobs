import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"

import type { AgentProviderId } from "@/lib/agent-providers"
import type { ResumeAiSelection, ResumeAiStreamEvent } from "@/lib/resume-ai"

export type JobImportStatus = "queued" | "running" | "completed" | "failed"

export type JobImportJob = {
  jobId: string
  status: JobImportStatus
  url: string
  provider: AgentProviderId
  model: string | null
  effort: string | null
  stage: string
  activities: ResumeAiStreamEvent[]
  importedJobId: number | null
  response: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

type JobImportEventEnvelope = {
  jobId: string
  job: JobImportJob
}

export async function listJobImportJobs() {
  try {
    return await invoke<JobImportJob[]>("list_job_import_jobs")
  } catch {
    // Browser previews do not have the Tauri command bridge. The desktop app
    // owns the actual background import state.
    return []
  }
}

export function startJobUrlImport(url: string, selection: ResumeAiSelection) {
  return invoke<JobImportJob>("start_job_url_import", {
    url,
    provider: selection.provider,
    model: selection.model,
    effort: selection.effort,
  })
}

export function subscribeToJobImportEvents(onJob: (job: JobImportJob) => void) {
  return listen<JobImportEventEnvelope>("job-import-event", ({ payload }) => {
    if (payload.job && payload.jobId === payload.job.jobId) onJob(payload.job)
  })
}
