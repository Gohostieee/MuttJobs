import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { runInBackground } from "./background-activity"
import type { Target } from "./job-workspace"
import type { ResumeAiSelection, ResumeAiStreamEvent } from "./resume-ai"

export type ResumeTargetCheck = {
  targets: Target[]
  resumeRevision: string
  targetRevision: string
  analysisStale: boolean
  stale: boolean
  result: null | {
    runId: string
    resumeRevision: string
    targetRevision: string
    checkedAt: string
    provider: string
    model: string
    effort: string
    assessments: { targetId: string; matched: boolean; reason: string; passages: { field: string; quote: string }[] }[]
  }
}
const activeRuns = new Map<string, string>()
export const resumeTargetTaskKey = (jobId: number, path: string) => `resume-targets:${jobId}:${path}`
export const readResumeTargetCheck = (jobId: number, path: string) =>
  invoke<ResumeTargetCheck>("resume_target_check_read", { jobId, path })

export async function checkResumeTargets(jobId: number, path: string, snapshot: ResumeTargetCheck, selection: ResumeAiSelection) {
  const key = resumeTargetTaskKey(jobId, path)
  return runInBackground(key, "Resume target check", async onEvent => {
    const runId = crypto.randomUUID()
    activeRuns.set(key, runId)
    let unlisten: (() => void) | undefined
    try {
      unlisten = await listen<{ runId: string; event: ResumeAiStreamEvent }>("resume-target-check-event", ({ payload }) => {
        if (payload.runId === runId) onEvent(payload.event)
      })
      onEvent({ type: "progress", stage: "Checking resume against targets…" })
      return await invoke<ResumeTargetCheck>("resume_target_check_run", {
        request: { jobId, path, runId, resumeRevision: snapshot.resumeRevision, targetRevision: snapshot.targetRevision, ...selection },
      })
    } finally { unlisten?.(); activeRuns.delete(key) }
  })
}
export async function cancelResumeTargetCheck(key: string) {
  const runId = activeRuns.get(key)
  if (runId) await invoke("resume_target_check_cancel", { runId })
}
