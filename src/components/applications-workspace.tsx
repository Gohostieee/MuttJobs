import { WorkspaceHeader, WorkspaceEmpty } from "@/components/workspace-layout"
import { Checkbox } from "@/components/ui/checkbox"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { FormField } from "@/components/form-field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
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

type Operation = "analyze" | "research"
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
      filter: (() => { const value = JSON.parse(localStorage.getItem("muttjobs.applications-view") || "{}").filter; return value === "Evidence to review" ? "Tasks to do" : value || defaults.filter })(),
    }
  } catch {
    return defaults
  }
}
const labels: Record<Operation, string> = {
  analyze: "Analyze selected jobs",
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
              operation,
              selection,
              id,
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
          (prefs.filter === "Tasks to do" && (s?.openActions ?? 0) > 0) ||
          (prefs.filter === "Application work remaining" &&
            ((s?.highPriority ?? 0) > 0 || (s?.openActions ?? 0) > 0)) ||
          (prefs.filter === "Ready for review" &&
            s?.analysis === "Complete" &&
            s.highPriority === 0 && s.openActions === 0) ||
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
        <Checkbox
          aria-label={`Select ${job.jobTitle} at ${job.company}`}
          checked={prefs.selected.includes(job.id)}
          disabled={running}
          onCheckedChange={(checked) => selectJob(job.id, checked === true)}
        />
        <Button variant="ghost"
          className="application-role h-auto min-w-0 flex-1 flex-col items-start gap-1 whitespace-normal"
          onClick={() => update({ jobId: job.id })}
        >
          <strong>{job.jobTitle}</strong>
          <span>{job.company}</span>
          <small>
            {job.location || job.longLocation || "Location not provided"}
            {job.salaryString ? ` · ${job.salaryString}` : ""}
          </small>
        </Button>
        <NativeSelect
          aria-label={`Stage for ${job.jobTitle}`}
          value={job.applicationStatus || "revealed"}
          onChange={(e) =>
            void setStage(job, e.target.value as ApplicationStatus)
          }
        >
          {applicationStatusMetadata.map((s) => (
            <NativeSelectOption key={s.value} value={s.value}>
              {s.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <div className="application-preparation-state">
          <Badge variant="outline">{summary?.analysis || "Not analyzed"}</Badge>
          <span>
            {summary?.highPriority || 0} high-priority unresolved ·{" "}
            {summary?.openActions || 0} open tasks
          </span>
          <small>
            {summary?.total || 0} requirements
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
      <WorkspaceHeader title="Applications" description="Track each role, review requirements, and prepare your next step." actions={<><Button variant="outline" onClick={() => void refresh()}><RefreshCw /> Refresh</Button><Button onClick={() => setImportOpen(true)}><Plus /> Import or paste job</Button></>} />
      {(error || dismissError) && (
        <Alert variant="destructive"><AlertDescription>{error || dismissError}</AlertDescription></Alert>
      )}
      <div
        ref={scroller}
        className="mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-auto p-4 sm:p-6"
        onScroll={(e) => update({ scroll: e.currentTarget.scrollTop })}
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input className="w-full sm:w-64" aria-label="Search applications"
            placeholder="Search role or company"
            value={prefs.query}
            onChange={(e) => update({ query: e.target.value })}
          />
          <NativeSelect
            aria-label="Preparation filter"
            value={prefs.filter}
            onChange={(e) => update({ filter: e.target.value })}
          >
            {[
              "All preparation",
              "Not analyzed",
              "Tasks to do",
              "Application work remaining",
              "Ready for review",
              "Stale",
            ].map((f) => (
              <NativeSelectOption key={f}>{f}</NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Sort applications"
            value={prefs.sort}
            onChange={(e) => update({ sort: e.target.value })}
          >
            {["Next action", "Role", "Company"].map((s) => (
              <NativeSelectOption key={s}>{s}</NativeSelectOption>
            ))}
          </NativeSelect>
          <ToggleGroup type="single" value={prefs.view} onValueChange={value => { if (value) update({ view: value as "list" | "board" }) }} aria-label="Application layout" variant="outline"><ToggleGroupItem value="list">List</ToggleGroupItem><ToggleGroupItem value="board">Board</ToggleGroupItem></ToggleGroup>
        </div>
        <section className="mb-6 flex flex-wrap items-center gap-3 border bg-card p-4 text-sm" aria-label="Bulk preparation">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={
                !!filtered.length &&
                filtered.every((j) => prefs.selected.includes(j.id))
              }
              disabled={running}
              onCheckedChange={(checked) =>
                update({
                  selected: checked === true
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
          <NativeSelect
            aria-label="Preparation operation"
            disabled={running}
            value={operation}
            onChange={(e) => {
              setOperation(e.target.value as Operation)
              setProgress({})
            }}
          >
            {Object.entries(labels).map(([id, label]) => (
              <NativeSelectOption key={id} value={id}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
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
          <div role="status" aria-label="Loading saved applications" className="grid gap-3">{[0, 1, 2].map(index => <Skeleton key={index} className="h-20" />)}</div>
        ) : !jobs.length ? (
          <WorkspaceEmpty title="Your application workspace starts here" description="Import a posting or save a result from Search to begin preparing."><Button onClick={() => setImportOpen(true)}>Import or paste job</Button></WorkspaceEmpty>
        ) : prefs.view === "list" ? (
          <section aria-label="Applications list">
            {filtered.map(row)}
            {!filtered.length && <WorkspaceEmpty title="No matching applications" description="Try a different search or preparation filter." />}
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
            <FormField label="Posting URL (optional)"><Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              /></FormField>
            <FormField label="Complete posting text"><Textarea
                rows={10}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              /></FormField>
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
