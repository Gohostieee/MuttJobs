import { BackgroundActivityPreview } from "./background-activity"
import { runInBackground } from "@/lib/background-activity"
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Plus, RefreshCw } from "lucide-react"
import { JobWorkspace } from "./job-workspace"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog"
import {
  DEFAULT_RESUME_AI_SELECTION,
  ModelReasoningSelector,
} from "./resume-ai-sidebar"
import { ImportStatus, useImportDismissals } from "./import-status"
import {
  listSavedTheirStackJobs,
  applicationStatusMetadata,
  updateTheirStackJobStatus,
  type TheirStackJob,
  type ApplicationStatus,
} from "@/lib/theirstack"
import {
  listPreparationSummaries,
  readJobWorkspace,
  runWorkspace,
  cancelWorkspaceRun,
  workspaceError,
  type PreparationSummary,
} from "@/lib/job-workspace"
import {
  listJobImportJobs,
  startJobUrlImport,
  subscribeToJobImportEvents,
  type JobImportJob,
} from "@/lib/job-import"
import {
  createCompanyResearchRequest,
  startCompanyResearchRun,
  cancelCompanyResearchRun,
} from "@/lib/company-research"

type Operation = "analyze" | "match" | "resume" | "coverLetter" | "research"
type Progress = {
  status: "queued" | "running" | "completed" | "failed" | "cancelled"
  message: string
}
type Preferences = {
  view: "list" | "board"
  filter: string
  query: string
  sort: string
  selected: number[]
  jobId: number | null
  scroll: number
}
function preferences(): Preferences {
  const defaults: Preferences = {
    view: "list",
    filter: "All preparation",
    query: "",
    sort: "Next action",
    selected: [],
    jobId: null,
    scroll: 0,
  }
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem("muttjobs.applications-view") || "{}"),
    }
  } catch {
    return defaults
  }
}
const labels: Record<Operation, string> = {
  analyze: "Analyze selected jobs",
  match: "Match Career Profile",
  resume: "Prepare targeted resumes",
  coverLetter: "Prepare cover letters (optional)",
  research: "Run Company Research",
}
export function ApplicationsWorkspace({
  onDocumentViewerChange,
}: {
  onDocumentViewerChange?: (open: boolean) => void
}) {
  const [jobs, setJobs] = useState<TheirStackJob[]>([])
  const [summaries, setSummaries] = useState<
    Record<number, PreparationSummary>
  >({})
  const [prefs, setPrefs] = useState(preferences)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selection, setSelection] = useState(DEFAULT_RESUME_AI_SELECTION)
  const [operation, setOperation] = useState<Operation>("analyze")
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Record<number, Progress>>({})
  const [imports, setImports] = useState<JobImportJob[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [url, setUrl] = useState("")
  const [description, setDescription] = useState("")
  const cancelled = useRef(false)
  const active = useRef(new Map<number, { id: string; research: boolean }>())
  const scroller = useRef<HTMLDivElement>(null)
  const { isDismissed, dismiss, dismissError } = useImportDismissals("job")
  const update = (patch: Partial<Preferences>) =>
    setPrefs((p) => ({ ...p, ...patch }))
  const refresh = useCallback(async () => {
    try {
      const [jobs, summaries, imports] = await Promise.all([
        listSavedTheirStackJobs(),
        listPreparationSummaries(),
        listJobImportJobs(),
      ])
      setJobs(jobs)
      setSummaries(Object.fromEntries(summaries.map((s) => [s.jobId, s])))
      setImports(imports)
      setError("")
    } catch (cause) {
      setError(workspaceError(cause))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  useEffect(() => {
    localStorage.setItem("muttjobs.applications-view", JSON.stringify(prefs))
  }, [prefs])
  useEffect(() => {
    if (!loading && scroller.current)
      scroller.current.scrollTop = preferences().scroll
  }, [loading, prefs.jobId])
  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined
    void subscribeToJobImportEvents((job) => {
      setImports((current) => [
        ...current.filter((j) => j.jobId !== job.jobId),
        job,
      ])
      if (job.status === "completed") {
        void refresh()
        if (job.importedJobId)
          setPrefs((p) => ({ ...p, jobId: job.importedJobId }))
      }
    })
      .then((fn) => {
        if (disposed) fn()
        else cleanup = fn
      })
      .catch(() => {})
    return () => {
      disposed = true
      cleanup?.()
    }
  }, [refresh])
  async function setStage(job: TheirStackJob, status: ApplicationStatus) {
    try {
      await updateTheirStackJobStatus(job.id, status)
      setJobs((current) =>
        current.map((j) =>
          j.id === job.id ? { ...j, applicationStatus: status } : j,
        ),
      )
    } catch (cause) {
      setError(workspaceError(cause))
    }
  }
  async function bulk(retry = false) {
    if (running) return
    const selected = jobs.filter((j) =>
      retry
        ? progress[j.id]?.status === "failed" ||
          progress[j.id]?.status === "cancelled"
        : prefs.selected.includes(j.id),
    )
    if (!selected.length) return
    cancelled.current = false
    setRunning(true)
    setError("")
    setProgress((current) => ({
      ...(retry ? current : {}),
      ...Object.fromEntries(
        selected.map((j) => [j.id, { status: "queued", message: "Waiting" }]),
      ),
    }))
    let cursor = 0
    async function worker() {
      while (cursor < selected.length && !cancelled.current) {
        const job = selected[cursor++]
        const id = crypto.randomUUID()
        active.current.set(job.id, { id, research: operation === "research" })
        setProgress((p) => ({
          ...p,
          [job.id]: { status: "running", message: labels[operation] },
        }))
        try {
          if (operation === "research") {
            const request = {
              ...createCompanyResearchRequest(job, selection),
              runId: id,
            }
            await runInBackground(`company-research-${job.id}`, "Company research", async (onEvent) => {
              const result = await startCompanyResearchRun(request, (event) => {
                if (event.kind === "activity") {
                  onEvent(event.event.type === "item"
                    ? { ...event.event, id: `${event.agentId}:${event.event.id}` }
                    : event.event)
                }
              })
              if (result.ledgerStatus !== "completed")
                throw new Error("Company Research did not produce a completed ledger.")
              return result
            })
          } else {
            const workspace = await readJobWorkspace(job.id)
            if (cancelled.current) throw new Error("Cancelled before starting.")
            const result = await runWorkspace(
              workspace,
              operation === "resume" || operation === "coverLetter"
                ? "prepare"
                : operation,
              selection,
              id,
              [],
              operation === "coverLetter" ? "coverLetter" : "resume",
            )
            setSummaries((current) => ({
              ...current,
              [job.id]: result.summary,
            }))
          }
          setProgress((p) => ({
            ...p,
            [job.id]: { status: "completed", message: "Saved for review" },
          }))
        } catch (cause) {
          setProgress((p) => ({
            ...p,
            [job.id]: {
              status: cancelled.current ? "cancelled" : "failed",
              message: workspaceError(cause),
            },
          }))
        } finally {
          active.current.delete(job.id)
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(2, selected.length) }, worker),
    )
    setProgress((p) =>
      Object.fromEntries(
        Object.entries(p).map(([id, state]) => [
          id,
          state.status === "queued"
            ? { status: "cancelled", message: "Cancelled before starting" }
            : state,
        ]),
      ),
    )
    setRunning(false)
  }
  async function cancel() {
    cancelled.current = true
    const results = await Promise.allSettled(
      [...active.current].map(([jobId, run]) =>
        run.research
          ? cancelCompanyResearchRun(jobId, run.id)
          : cancelWorkspaceRun(run.id),
      ),
    )
    const failure = results.find((r) => r.status === "rejected")
    if (failure?.status === "rejected") setError(workspaceError(failure.reason))
  }
  async function importJob(event: FormEvent) {
    event.preventDefault()
    if (!url.trim() && !description.trim()) return
    setImporting(true)
    try {
      const job = await startJobUrlImport(
        url.trim(),
        selection,
        description.trim() || undefined,
      )
      setImports((current) => [...current, job])
      setImportOpen(false)
      setUrl("")
      setDescription("")
    } catch (cause) {
      setError(workspaceError(cause))
    } finally {
      setImporting(false)
    }
  }
  const selectedJob = jobs.find((j) => j.id === prefs.jobId)
  const filtered = jobs
    .filter((j) => {
      const s = summaries[j.id]
      return (
        `${j.jobTitle} ${j.company}`
          .toLowerCase()
          .includes(prefs.query.toLowerCase()) &&
        (prefs.filter === "All preparation" ||
          (prefs.filter === "Not analyzed" && s?.analysis === "Not analyzed") ||
          (prefs.filter === "Evidence to review" &&
            (s?.evidenceToReview ?? 0) > 0) ||
          (prefs.filter === "Application work remaining" &&
            ((s?.highPriority ?? 0) > 0 || (s?.openActions ?? 0) > 0)) ||
          (prefs.filter === "Ready for review" &&
            s?.analysis === "Complete" &&
            s.documentReview === "Coverage reviewed" &&
            s.highPriority === 0 &&
            s.evidenceToReview === 0) ||
          (prefs.filter === "Stale" && s?.analysis === "Stale"))
      )
    })
    .sort((a, b) =>
      prefs.sort === "Role"
        ? a.jobTitle.localeCompare(b.jobTitle)
        : prefs.sort === "Company"
          ? (a.company || "").localeCompare(b.company || "")
          : (summaries[b.id]?.highPriority ?? 0) -
            (summaries[a.id]?.highPriority ?? 0),
    )
  const selectJob = (id: number, checked: boolean) =>
    update({
      selected: checked
        ? [...new Set([...prefs.selected, id])]
        : prefs.selected.filter((v) => v !== id),
    })
  if (selectedJob)
    return (
      <JobWorkspace
        key={selectedJob.id}
        job={selectedJob}
        selection={selection}
        onSelectionChange={setSelection}
        onBack={() => {
          update({ jobId: null })
          void refresh()
        }}
        onDocumentViewerChange={onDocumentViewerChange}
        onJobChange={(next) =>
          setJobs((current) =>
            current.map((j) => (j.id === next.id ? next : j)),
          )
        }
      />
    )
  const row = (job: TheirStackJob) => {
    const summary = summaries[job.id]
    return (
      <article
        key={job.id}
        className="application-preparation-row"
        draggable={!running}
        onDragStart={(e) =>
          e.dataTransfer.setData("text/plain", String(job.id))
        }
      >
        <input
          type="checkbox"
          aria-label={`Select ${job.jobTitle} at ${job.company}`}
          checked={prefs.selected.includes(job.id)}
          disabled={running}
          onChange={(e) => selectJob(job.id, e.target.checked)}
        />
        <button
          className="application-role"
          onClick={() => update({ jobId: job.id })}
        >
          <strong>{job.jobTitle}</strong>
          <span>{job.company}</span>
          <small>
            {job.location || job.longLocation || "Location not provided"}
            {job.salaryString ? ` · ${job.salaryString}` : ""}
          </small>
        </button>
        <select
          aria-label={`Stage for ${job.jobTitle}`}
          value={job.applicationStatus || "revealed"}
          onChange={(e) =>
            void setStage(job, e.target.value as ApplicationStatus)
          }
        >
          {applicationStatusMetadata.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="application-preparation-state">
          <Badge variant="outline">{summary?.analysis || "Not analyzed"}</Badge>
          <span>
            {summary?.highPriority || 0} high-priority unresolved ·{" "}
            {summary?.evidenceToReview || 0} evidence reviews
          </span>
          <small>
            {summary?.addressed || 0}/{summary?.total || 0} resume targets
            addressed · {summary?.documentReview || "Unreviewed"}
          </small>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => update({ jobId: job.id })}
        >
          {summary?.nextAction || "Open job"}
        </Button>
        {progress[job.id] && (
          <p role="status" className="application-run-status">
            {progress[job.id].status}: {progress[job.id].message}
          </p>
        )}
        <div className="application-reasoning">
          <BackgroundActivityPreview taskKey={`job-workspace-${job.id}`} expandToContent />
          <BackgroundActivityPreview taskKey={`company-research-${job.id}`} expandToContent />
        </div>
        {!progress[job.id] && summary?.latestRun && (
          <p role="status" className="application-run-status">
            {summary.latestRun.status}: {summary.latestRun.message}
          </p>
        )}
      </article>
    )
  }
  return (
    <main className="applications-preparation">
      <header>
        <div>
          <p className="job-eyebrow">Applications</p>
          <h1>Build a well-supported application.</h1>
          <p>
            See what each employer wants, what you can demonstrate, and what
            needs attention.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            <RefreshCw /> Refresh
          </Button>
          <Button onClick={() => setImportOpen(true)}>
            <Plus /> Import or paste job
          </Button>
        </div>
      </header>
      {(error || dismissError) && (
        <p role="alert" className="workspace-error">
          {error || dismissError}
        </p>
      )}
      <div
        ref={scroller}
        className="applications-preparation-content"
        onScroll={(e) => update({ scroll: e.currentTarget.scrollTop })}
      >
        <div className="application-filters">
          <input
            aria-label="Search applications"
            placeholder="Search role or company"
            value={prefs.query}
            onChange={(e) => update({ query: e.target.value })}
          />
          <select
            aria-label="Preparation filter"
            value={prefs.filter}
            onChange={(e) => update({ filter: e.target.value })}
          >
            {[
              "All preparation",
              "Not analyzed",
              "Evidence to review",
              "Application work remaining",
              "Ready for review",
              "Stale",
            ].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <select
            aria-label="Sort applications"
            value={prefs.sort}
            onChange={(e) => update({ sort: e.target.value })}
          >
            {["Next action", "Role", "Company"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <Button
            variant={prefs.view === "list" ? "default" : "outline"}
            onClick={() => update({ view: "list" })}
          >
            List
          </Button>
          <Button
            variant={prefs.view === "board" ? "default" : "outline"}
            onClick={() => update({ view: "board" })}
          >
            Board
          </Button>
        </div>
        <section className="application-bulk" aria-label="Bulk preparation">
          <label>
            <input
              type="checkbox"
              checked={
                !!filtered.length &&
                filtered.every((j) => prefs.selected.includes(j.id))
              }
              disabled={running}
              onChange={(e) =>
                update({
                  selected: e.target.checked
                    ? [
                        ...new Set([
                          ...prefs.selected,
                          ...filtered.map((j) => j.id),
                        ]),
                      ]
                    : prefs.selected.filter(
                        (id) => !filtered.some((j) => j.id === id),
                      ),
                })
              }
            />{" "}
            Select visible jobs ({prefs.selected.length} selected)
          </label>
          <select
            aria-label="Preparation operation"
            disabled={running}
            value={operation}
            onChange={(e) => {
              setOperation(e.target.value as Operation)
              setProgress({})
            }}
          >
            {Object.entries(labels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <span>Model &amp; reasoning</span>
          <ModelReasoningSelector
            value={selection}
            onChange={setSelection}
            disabled={running}
          />
          <Button
            disabled={
              running ||
              !prefs.selected.length ||
              (operation === "analyze" && selection.provider !== "codex")
            }
            onClick={() => void bulk()}
          >
            Run selected operation
          </Button>
          {running && (
            <Button variant="outline" onClick={() => void cancel()}>
              Cancel queued and active
            </Button>
          )}
          {Object.values(progress).some(
            (p) => p.status === "failed" || p.status === "cancelled",
          ) && (
            <Button
              disabled={running}
              variant="outline"
              onClick={() => void bulk(true)}
            >
              Retry failed / cancelled
            </Button>
          )}
        </section>
        {imports
          .filter((j) => !isDismissed(j.jobId))
          .map((j) => (
            <ImportStatus
              key={j.jobId}
              title={j.url || "Pasted posting"}
              metadata={[j.model, j.effort].filter(Boolean).join(" · ")}
              status={j.status}
              stage={j.stage}
              error={j.error}
              activities={j.activities.flatMap((e) =>
                e.type === "item"
                  ? [
                      {
                        id: e.id,
                        kind: e.kind,
                        status: e.status,
                        eventType: e.eventType,
                        item: e.item,
                      },
                    ]
                  : [],
              )}
              onDismiss={() => dismiss(j.jobId)}
            />
          ))}
        {loading ? (
          <p role="status">Loading saved applications…</p>
        ) : !jobs.length ? (
          <section className="unanalyzed-job">
            <h2>Your application workspace starts here</h2>
            <p>
              Import a posting or save a result from Search. Opening this page
              does not run analysis.
            </p>
            <Button onClick={() => setImportOpen(true)}>
              Import or paste job
            </Button>
          </section>
        ) : prefs.view === "list" ? (
          <section aria-label="Applications list">
            {filtered.map(row)}
            {!filtered.length && <p>No applications match these filters.</p>}
          </section>
        ) : (
          <section className="application-board" aria-label="Application board">
            {applicationStatusMetadata.map((status) => (
              <div
                className="application-column"
                key={status.value}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const job = jobs.find(
                    (j) =>
                      j.id === Number(e.dataTransfer.getData("text/plain")),
                  )
                  if (job) void setStage(job, status.value)
                }}
              >
                <h2>
                  {status.label}{" "}
                  <span>
                    {
                      filtered.filter(
                        (j) =>
                          (j.applicationStatus || "revealed") === status.value,
                      ).length
                    }
                  </span>
                </h2>
                {filtered
                  .filter(
                    (j) => (j.applicationStatus || "revealed") === status.value,
                  )
                  .map(row)}
              </div>
            ))}
          </section>
        )}
      </div>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import a job posting</DialogTitle>
            <DialogDescription>
              Provide a URL, paste its text, or both. Import runs only when you
              submit.
            </DialogDescription>
          </DialogHeader>
          <form
            className="target-edit-form"
            onSubmit={(e) => void importJob(e)}
          >
            <label>
              Posting URL (optional)
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label>
              Complete posting text
              <textarea
                rows={10}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <span>Model &amp; reasoning</span>
            <ModelReasoningSelector
              value={selection}
              onChange={setSelection}
              disabled={importing}
            />
            <Button
              disabled={importing || (!url.trim() && !description.trim())}
            >
              {importing ? "Starting import…" : "Import posting"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}
