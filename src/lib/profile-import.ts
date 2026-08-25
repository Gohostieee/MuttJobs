import { invoke } from "@tauri-apps/api/core"

import type { ResumeAiSelection } from "@/lib/resume-ai"
import type { ProfileDocument } from "@/lib/profile-storage"

export type ProfileResumeImportResult = {
  profile: ProfileDocument
  response: string
}

export function importProfileFromResumePdf(
  pdfPath: string,
  profile: ProfileDocument,
  selection: ResumeAiSelection,
) {
  return invoke<ProfileResumeImportResult>("import_profile_from_resume_pdf", {
    pdfPath,
    profile,
    provider: selection.provider,
    model: selection.model,
    effort: selection.effort,
  })
}
