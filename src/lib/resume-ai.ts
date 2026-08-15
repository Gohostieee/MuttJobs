import { invoke } from "@tauri-apps/api/core"

import { normalizeAndValidateResume } from "@/lib/resume-validation"
import type { ResumeData } from "@/lib/resume-types"

export type ResumeAiResult = {
  data: ResumeData
  response: string
  changed: boolean
}

export async function runResumeAiJob(path: string, prompt: string): Promise<ResumeAiResult> {
  const value = await invoke<unknown>("run_resume_ai_job", { path, prompt })
  const source = asRecord(value)
  const data = normalizeAndValidateResume(source.data)
  return {
    data,
    response: typeof source.response === "string" ? source.response : "Resume update completed.",
    changed: source.changed === true,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new Error("Codex returned an invalid resume update.")
}
