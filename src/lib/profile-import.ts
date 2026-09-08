import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"

import type { ResumeAiSelection, ResumeAiStreamEvent } from "@/lib/resume-ai"
import type { ProfileDocument } from "@/lib/profile-storage"

export type ProfileResumeImportResult = {
  profile: ProfileDocument
  response: string
}

export async function importProfileFromResumePdf(
  pdfPath: string,
  profile: ProfileDocument,
  selection: ResumeAiSelection,
  onEvent: (event: ResumeAiStreamEvent) => void,
) {
  const runId = crypto.randomUUID()
  const unlisten = await listen<{ jobId: string; event: ResumeAiStreamEvent }>(
    "profile-import-ai-event",
    ({ payload }) => { if (payload.jobId === runId) onEvent(payload.event) },
  )
  try {
    return await invoke<ProfileResumeImportResult>("import_profile_from_resume_pdf", {
      pdfPath,
      runId,
      profile,
      provider: selection.provider,
      model: selection.model,
      effort: selection.effort,
    })
  } finally {
    unlisten()
  }
}
