import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Circle, LoaderCircle, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { DEFAULT_RESUME_AI_SELECTION, ModelReasoningSelector } from "./resume-ai-sidebar"
import { BackgroundActivityPreview } from "./background-activity"
import { useBackgroundActivity } from "@/lib/background-activity"
import { listSavedTheirStackJobs, type TheirStackJob } from "@/lib/theirstack"
import { workspaceError } from "@/lib/job-workspace"
import type { ResumeFile } from "@/lib/resume-types"
import { readResumeTargetCheck, checkResumeTargets, cancelResumeTargetCheck, resumeTargetTaskKey, type ResumeTargetCheck } from "@/lib/resume-target-check"

export function ResumeTargetsPanel({ file, targetJobId, dirty, beforeRun, onCheckChange }: {
  file: ResumeFile
  targetJobId?: number
  dirty: boolean
  beforeRun: () => Promise<ResumeFile>
  onCheckChange: (check: ResumeTargetCheck | null) => void
}) {
  const [jobs, setJobs] = useState<TheirStackJob[]>([])
  const [jobId, setJobId] = useState(() => targetJobId ?? (Number(localStorage.getItem(`muttjobs.resume-target-job:${file.path}`)) || 0))
  const [selection, setSelection] = useState(DEFAULT_RESUME_AI_SELECTION)
  const [view, setView] = useState<ResumeTargetCheck | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const key = resumeTargetTaskKey(jobId, file.path)
  const activeKey = useRef(key)
  activeKey.current = key
  const task = useBackgroundActivity(state => state.runs[key])
  const busy = starting || task?.status === "running"
  const requestVersion = useRef(0)

  useEffect(() => {
    let disposed = false
    void listSavedTheirStackJobs().then(items => { if (!disposed) setJobs(items) }).catch(cause => { if (!disposed) setError(workspaceError(cause)) })
    return () => { disposed = true }
  }, [])
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current
    if (!jobId) { setView(null); return }
    setLoading(true)
    try {
      const next = await readResumeTargetCheck(jobId, file.path)
      if (version === requestVersion.current) { setView(current => JSON.stringify(current) === JSON.stringify(next) ? current : next); setError("") }
    } catch (cause) {
      if (version === requestVersion.current) { setView(null); setError(workspaceError(cause)) }
    } finally { if (version === requestVersion.current) setLoading(false) }
  }, [jobId, file.path])
  useEffect(() => {
    void refresh()
    return () => { requestVersion.current++ }
  }, [refresh, file.revision, task?.status])
  useEffect(() => {
    const focus = () => { void refresh() }
    window.addEventListener("focus", focus)
    return () => window.removeEventListener("focus", focus)
  }, [refresh])

  async function run() {
    if (!jobId || busy) return
    const runKey = key
    setStarting(true); setError("")
    try {
      const saved = await beforeRun()
      const snapshot = await readResumeTargetCheck(jobId, saved.path)
      if (activeKey.current !== runKey) return
      setView(snapshot)
      await checkResumeTargets(jobId, saved.path, snapshot, selection)
      if (activeKey.current === runKey) await refresh()
    } catch (cause) { if (activeKey.current === runKey) setError(workspaceError(cause)) }
    finally { if (activeKey.current === runKey) setStarting(false) }
  }
  async function cancel() {
    setCancelling(true)
    try { await cancelResumeTargetCheck(key) }
    catch (cause) { setError(workspaceError(cause)) }
    finally { setCancelling(false) }
  }
  const stale = dirty || !!view?.stale || (!!view && !!file.revision && file.revision !== view.resumeRevision)
  const checked = !!view?.result && !stale
  useEffect(() => {
    onCheckChange(checked ? view : null)
    return () => onCheckChange(null)
  }, [checked, view, onCheckChange])
  const matched = checked ? view?.result?.assessments.filter(item => item.matched).length ?? 0 : 0
  const job = jobs.find(item => item.id === jobId)
  return <section className="resume-targets" aria-label="Resume targets">
    <div className="resume-targets-controls">
      {targetJobId ? <p className="resume-targets-job">{job?.jobTitle || "Job targets"}{job?.company ? ` · ${job.company}` : ""}</p> :
        <Field><FieldLabel htmlFor="resume-target-job">Job</FieldLabel><NativeSelect id="resume-target-job" value={jobId} disabled={busy} onChange={event => {
          const id = Number(event.target.value); setJobId(id); setView(null); setError(""); localStorage.setItem(`muttjobs.resume-target-job:${file.path}`, String(id))
        }}><NativeSelectOption value={0}>Choose a saved job</NativeSelectOption>{jobs.map(item => <NativeSelectOption key={item.id} value={item.id}>{item.jobTitle} · {item.company}</NativeSelectOption>)}</NativeSelect></Field>}
      {jobId > 0 && <>
        <div className="resume-targets-model" role="group" aria-label="Target check model and reasoning"><ModelReasoningSelector value={selection} onChange={setSelection} disabled={busy} showServiceTier={false} /></div>
        <div className="resume-targets-run">
          <Button size="sm" onClick={() => void run()} disabled={busy || loading || !view?.targets.length || view.analysisStale}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Play />} {busy ? "Checking…" : "Check resume"}
          </Button>
          {task?.status === "running" && <Button size="sm" variant="ghost" onClick={() => void cancel()} disabled={cancelling}>{cancelling ? "Cancelling…" : "Cancel"}</Button>}
          {!busy && !!view?.targets.length && <span role="status">{checked ? `${matched}/${view.targets.length} matched` : "Not checked"}</span>}
        </div>
      </>}
    </div>
    {error || task?.error ? <p className="resume-targets-message text-destructive" role="alert">{error || task?.error}</p> : null}
    {loading && <p className="resume-targets-message" role="status">Loading targets…</p>}
    {!jobId && <p className="resume-targets-message">Choose the job you’re preparing for to see its targets.</p>}
    {!!view && !view.targets.length && <p className="resume-targets-message">Analyze this job in Applications to create its targets.</p>}
    {view?.analysisStale && <p className="resume-targets-message" role="status">The posting changed. Refresh its requirements in Applications first.</p>}
    {stale && view?.result && !view.analysisStale && <p className="resume-targets-message" role="status">Resume or targets changed. Check again to update the ticks.</p>}
    {!!view?.targets.length && <ul className="resume-target-list" aria-label="Job target checklist">
      {view.targets.map(target => {
        const assessment = checked ? view.result?.assessments.find(item => item.targetId === target.id) : undefined
        return <li key={target.id} data-matched={!!assessment?.matched}>
          <details>
            <summary><span className="resume-target-tick" role="img" aria-label={assessment?.matched ? "Matched" : assessment ? "Not matched" : "Not checked"}>{assessment?.matched ? <Check /> : <Circle />}</span><span>{target.title}</span></summary>
            <div className="resume-target-detail"><p>{assessment?.reason || target.interpretation}</p>{assessment?.passages.map((passage, index) => <blockquote key={index}>{passage.quote}</blockquote>)}</div>
          </details>
        </li>
      })}
    </ul>}
    {jobId > 0 && task && <div className="resume-targets-activity"><BackgroundActivityPreview taskKey={key} /></div>}
  </section>
}
