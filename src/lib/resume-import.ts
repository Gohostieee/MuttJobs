import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type { ResumeAiSelection, ResumeAiStreamEvent } from "@/lib/resume-ai"

export type ResumeImportStatus = "queued" | "running" | "completed" | "failed"

export type ResumeImportJob = {
  jobId: string
  status: ResumeImportStatus
  pdfFileName: string
  resumeName: string | null
  resumeFileName: string | null
  provider: ResumeAiSelection["provider"]
  model: string | null
  effort: string | null
  stage: string
  activities: ResumeAiStreamEvent[]
  response: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

type ResumeImportEventEnvelope = {
  jobId: string
  job: ResumeImportJob
}

export async function listResumeImportJobs() {
  try {
    return await invoke<ResumeImportJob[]>("list_resume_import_jobs")
  } catch {
    // The browser preview has no Tauri command bridge. The desktop app owns
    // the actual background import state.
    return []
  }
}

export function startResumePdfImport(
  pdfPath: string,
  name: string | undefined,
  selection: ResumeAiSelection,
) {
  return invoke<ResumeImportJob>("start_resume_pdf_import", {
    pdfPath,
    name: name?.trim() || null,
    provider: selection.provider,
    model: selection.model,
    effort: selection.effort,
  })
}

export async function subscribeToResumeImportEvents(
  onJob: (job: ResumeImportJob) => void,
) {
  return listen<ResumeImportEventEnvelope>("resume-import-event", ({ payload }) => {
    if (payload.job && payload.jobId === payload.job.jobId) onJob(payload.job)
  })
}
