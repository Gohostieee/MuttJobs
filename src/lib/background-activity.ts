import { create } from "zustand"
import type { ResumeAiStreamEvent } from "./resume-ai"

export type BackgroundActivity = {
  title: string
  status: "running" | "completed" | "failed"
  stage: string
  activities: Extract<ResumeAiStreamEvent, { type: "item" }>[]
  error: string | null
  result?: unknown
}

export const useBackgroundActivity = create<{ runs: Record<string, BackgroundActivity> }>(() => ({ runs: {} }))

export async function runInBackground<T>(
  key: string,
  title: string,
  execute: (onEvent: (event: ResumeAiStreamEvent) => void) => Promise<T>,
): Promise<T> {
  if (useBackgroundActivity.getState().runs[key]?.status === "running") throw new Error("This task is already running.")
  const update = (patch: Partial<BackgroundActivity>) => useBackgroundActivity.setState(({ runs }) => ({
    runs: { ...runs, [key]: { ...runs[key], ...patch } },
  }))
  update({ title, status: "running", stage: "Preparing…", activities: [], error: null, result: undefined })
  try {
    const result = await execute((event) => {
      if (event.type === "progress") update({ stage: event.stage })
      if (event.type === "item") {
        const activities = useBackgroundActivity.getState().runs[key].activities
        const found = activities.some((item) => item.id === event.id)
        update({ activities: found ? activities.map((item) => item.id === event.id ? event : item) : [...activities, event] })
      }
    })
    update({ status: "completed", stage: "Completed", result })
    return result
  } catch (cause) {
    const message = cause !== null && typeof cause === "object"
      && "message" in cause && typeof cause.message === "string"
      ? cause.message
      : String(cause)
    update({ status: "failed", stage: "Failed", error: message })
    throw cause
  }
}
