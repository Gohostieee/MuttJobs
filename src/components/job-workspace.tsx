import { Progress } from "@/components/ui/progress"
import { FormField } from "@/components/form-field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { JobResumeEditor } from "./job-resume-editor"
import { BackgroundActivityPreview } from "./background-activity"
import { useBackgroundActivity } from "@/lib/background-activity"
import { useCallback, useEffect, useRef, useState } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { TargetCriteriaEditor } from "./target-criteria-editor"
import type { ResumeAiSelection } from "@/lib/resume-ai"
import type { WorkspaceMutations } from "@/lib/job-workspace"
import {
  ArrowLeft,
  Check,
  FileText,
  LoaderCircle,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { CompanyResearchWorkspace } from "@/components/company-research-workspace"
import {
  DEFAULT_RESUME_AI_SELECTION,
  ModelReasoningSelector,
} from "@/components/resume-ai-sidebar"
import {
  applicationStatusMetadata,
  updateTheirStackJobStatus,
  type TheirStackJob,
  type ApplicationStatus,
} from "@/lib/theirstack"
import {
  readJobWorkspace,
  mutateJobWorkspace,
  runWorkspace,
  cancelWorkspaceRun,
  workspaceTargets,
  workspaceError,
  emptyTarget,
  type JobPreparation,
  type Target,
  type WorkspaceOperation,
} from "@/lib/job-workspace"
import {
  requirementConfirmed,
} from "@/lib/job-preparation-flow"
import "./job-workspace.css"

const destinations = [
  "Targets",
  "Tasks",
  "Resume",
  "Company Research",
  "Activity",
] as const
type ViewState = {
  destination: (typeof destinations)[number]
  targetId: string
  filter: string
  scroll: number
}
function restoredView(id: number): ViewState {
  const defaults: ViewState = {
    destination: "Targets",
    targetId: "",
    filter: "All targets",
    scroll: 0,
  }
  try {
    const saved = JSON.parse(localStorage.getItem(`muttjobs.job-view.${id}`) || "{}")
    return { ...defaults, ...saved, destination: destinations.includes(saved.destination) ? saved.destination : "Targets" }
  } catch {
    return defaults
  }
}

export function JobWorkspace({
  job,
  onBack,
  onJobChange,
  selection: providedSelection,
  onSelectionChange,
  onDocumentViewerChange,
}: {
  job: TheirStackJob
  selection?: ResumeAiSelection
  onSelectionChange?: (selection: ResumeAiSelection) => void
  onBack: () => void
  onJobChange?: (job: TheirStackJob) => void
  onDocumentViewerChange?: (open: boolean) => void
}) {
  const [localSelection, setLocalSelection] = useState(DEFAULT_RESUME_AI_SELECTION)
  const selection = providedSelection ?? localSelection
  const changeSelection = onSelectionChange ?? setLocalSelection
  const [workspace, setWorkspaceState] = useState<JobPreparation | null>(null)
  const visibleJob = useRef(job.id)
  visibleJob.current = job.id
  const setWorkspace = useCallback((next: JobPreparation) => {
    if (next.jobId !== visibleJob.current) return
    setWorkspaceState((current) => current?.jobId === next.jobId && current.revision > next.revision ? current : next)
  }, [])
  const [view, setView] = useState(() => restoredView(job.id))
  useEffect(() => {
    onDocumentViewerChange?.(view.destination === "Resume")
    return () => onDocumentViewerChange?.(false)
  }, [view.destination, onDocumentViewerChange])
  const [error, setError] = useState("")
  const [locallyBusy, setBusy] = useState(false)
  const backgroundTask = useBackgroundActivity(
    (state) => state.runs[`job-workspace-${job.id}`],
  )
  const busy = locallyBusy || backgroundTask?.status === "running"
  useEffect(() => {
    if (backgroundTask?.status === "completed" && backgroundTask.result)
      setWorkspace(backgroundTask.result as JobPreparation)
  }, [backgroundTask?.status, backgroundTask?.result])
  const [runId, setRunId] = useState("")
  const [runStatus, setRunStatus] = useState("")
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceText, setSourceText] = useState("")
  const [editing, setEditing] = useState<Target | null>(null)
  const [splitRemainder, setSplitRemainder] = useState<Target | null>(null)
  const [lineage, setLineage] = useState<string[]>([])
  const [note, setNote] = useState("")
  const [inspectorTab, setInspectorTab] = useState("requirement")
  const content = useRef<HTMLElement>(null)
  const targetButton = useRef<HTMLButtonElement | null>(null)
  const refresh = useCallback(async () => {
    try {
      const next = await readJobWorkspace(job.id)
      setWorkspace(next)
      setSourceText(next.source.text)
      setError("")
    } catch (cause) {
      setError(workspaceError(cause))
    }
  }, [job.id])
  useEffect(() => {
    void refresh()
  }, [refresh])
  useEffect(() => {
    localStorage.setItem(`muttjobs.job-view.${job.id}`, JSON.stringify(view))
  }, [job.id, view])
  useEffect(() => {
    if (workspace && content.current)
      content.current.scrollTop = restoredView(job.id).scroll
  }, [!!workspace, job.id])
  useEffect(() => {
    if (!busy) return
    let disposed = false
    const timer = window.setInterval(() => {
      void readJobWorkspace(job.id).then((next) => { if (!disposed) setWorkspace(next) }).catch(() => {})
    }, 1500)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [busy, job.id])
  const targets = workspace ? workspaceTargets(workspace) : []
  const target = targets.find((t) => t.id === view.targetId)
  const updateView = (patch: Partial<ViewState>) =>
    setView((current) => ({ ...current, ...patch }))
  const closeInspector = () => {
    updateView({ targetId: "" })
    targetButton.current?.focus()
  }
  async function change<K extends keyof WorkspaceMutations>(
    operation: K,
    payload: WorkspaceMutations[K],
  ) {
    if (!workspace || busy) return
    setBusy(true)
    setError("")
    try {
      const next = await mutateJobWorkspace(workspace, operation, payload)
      setWorkspace(next)
      return next
    } catch (cause) {
      setError(workspaceError(cause))
    } finally {
      setBusy(false)
    }
  }
  async function run(operation: WorkspaceOperation) {
    if (!workspace || busy) return
    const id = crypto.randomUUID()
    setRunId(id)
    setBusy(true)
    setError("")
    setRunStatus("Starting?")
    try {
      setWorkspace(await runWorkspace(workspace, operation, selection, id))
      setRunStatus("Saved for review")
    } catch (cause) {
      setError(workspaceError(cause))
      setRunStatus("Previous work retained")
    } finally {
      void readJobWorkspace(job.id).then(setWorkspace).catch(() => {})
      setBusy(false)
      setRunId("")
    }
  }
  async function setStage(value: string) {
    try {
      await updateTheirStackJobStatus(job.id, value as ApplicationStatus)
      onJobChange?.({ ...job, applicationStatus: value as ApplicationStatus })
    } catch (cause) {
      setError(workspaceError(cause))
    }
  }
  function editTarget(t: Target, parents: string[] = []) {
    setEditing({ ...t })
    setSplitRemainder(
      parents.length === 1
        ? { ...t, id: "", title: "", interpretation: "", criteria: [] }
        : null,
    )
    setLineage(parents)
    setNote(workspace?.overrides.find((o) => o.targetId === t.id)?.note ?? "")
  }
  const confirmedCount = workspace
    ? targets.filter((t) => requirementConfirmed(workspace, t)).length
    : 0
  const analysisStale =
    !!workspace?.checklist &&
    workspace.checklist.analysis.sourceRevision !== workspace.source.revision
  const allConfirmed =
    !analysisStale && targets.length > 0 && confirmedCount === targets.length
  const filters = ["All targets", "To confirm"]
  const activeFilter = filters.includes(view.filter) ? view.filter : "All targets"
  const visibleTargets = targets.filter(t => activeFilter === "All targets" || !workspace || !requirementConfirmed(workspace, t))
  function navigate(destination: ViewState["destination"]) {
    updateView({ destination, targetId: "", filter: "All targets", scroll: 0 })
    content.current?.scrollTo({ top: 0 })
  }
  function openTarget(t: Target, button: HTMLButtonElement) {
    targetButton.current = button
    setInspectorTab("requirement")
    updateView({ targetId: t.id })
  }
  if (view.destination === "Resume") return <JobResumeEditor key={job.id} job={job} onBack={() => navigate("Targets")} />
  const inspector =
    target && workspace ? (
      <div className="target-inspector-content">
        <div className="target-detail-tabs" aria-label="Requirement details">
          {[
            ["requirement", "Requirement"],
            ["options", "Options"],
          ]
            .map(([id, label]) => (
              <Button variant="ghost"
                key={id}
                aria-pressed={inspectorTab === id}
                aria-controls={`target-panel-${id}`}
                id={`target-tab-${id}`}
                onClick={() => setInspectorTab(id)}
              >
                {label}
              </Button>
            ))}
        </div>
        {inspectorTab === "requirement" && (
          <section
            className="target-detail-panel"
            id="target-panel-requirement"
            aria-labelledby="target-tab-requirement"
          >
            <p>{target.interpretation}</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{target.requirementClass}</Badge>
              <Badge variant="outline">{target.grounding}</Badge>
            </div>
            <p>{target.rationale}</p>
            <h3>Why this target exists</h3>
            {target.sources.map((s, i) => (
              <Button variant="ghost"
                className="target-quote"
                key={i}
                onClick={() => setSourceOpen(true)}
              >
                <blockquote>{s.quote}</blockquote>
                <small>Original source · {s.paragraphId}</small>
              </Button>
            ))}
            {target.grounding === "Manual" && (
              <p>Personal preparation target supplied by you.</p>
            )}
            {target.criteria.map((c, i) => (
              <div className="target-evidence" key={i}>
                <strong>{c.label}</strong>
                <p>
                  {c.relationship}: {c.alternatives.join(" / ")}
                  {c.minimum !== null ? ` · ${c.minimum} ${c.unit}` : ""}
                </p>
              </div>
            ))}
            <Button
              disabled={busy || analysisStale}
              variant={
                requirementConfirmed(workspace, target)
                  ? "secondary"
                  : "default"
              }
              onClick={() =>
                void change("confirmTarget", {
                  targetId: target.id,
                  confirmed: !requirementConfirmed(workspace, target),
                })
              }
            >
              {requirementConfirmed(workspace, target)
                ? "Undo confirmation"
                : "Confirm requirement"}
            </Button>
          </section>
        )}
        {inspectorTab === "options" && (
          <section
            className="target-detail-panel"
            id="target-panel-options"
            aria-labelledby="target-tab-options"
          >
            <h3>Preparation and notes</h3>
            {workspace.actions
              .filter((a) => a.targetIds.includes(target.id))
              .map((a) => (
                <div className="target-evidence" key={a.id}>
                  <p>{a.title}</p>
                  <small>{a.completionCondition}</small>
                  <NativeSelect
                    aria-label={`Status of ${a.title}`}
                    value={a.status}
                    disabled={busy}
                    onChange={(e) => {
                      const status = e.target.value
                      const reason =
                        status === "Dismissed"
                          ? window.prompt("Why is this action dismissed?")
                          : a.reason
                      if (reason !== null)
                        void change("action", { ...a, status, reason })
                    }}
                  >
                    {[
                      "To do",
                      "In progress",
                      "Blocked",
                      "Done",
                      "Dismissed",
                    ].map((s) => (
                      <NativeSelectOption key={s}>{s}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              ))}
            <p>
              {workspace.overrides.find((o) => o.targetId === target.id)?.note}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => editTarget(target)}
              >
                Edit / notes
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  editTarget(
                    {
                      ...target,
                      id: "",
                      title: `${target.title} — supporting target`,
                    },
                    [target.id],
                  )
                }
              >
                Split target
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void change("target", {
                    target,
                    dismissed: true,
                    note: "Dismissed by user",
                    lineage: [],
                  })
                }
              >
                Dismiss
              </Button>
            </div>
          </section>
        )}
      </div>
    ) : null
  return (
    <main
      className="job-preparation"
      ref={content}
      onScroll={(e) => {
        if (e.target === e.currentTarget)
          updateView({ scroll: e.currentTarget.scrollTop })
      }}
    >
      <header className="job-preparation-header">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Applications
        </Button>
        <div className="job-preparation-title">
          <div>
            <p className="job-eyebrow">
              {job.company || "Company not provided"}
            </p>
            <h1>{job.jobTitle}</h1>
          </div>
          <details className="job-details-menu">
            <summary>Job details</summary>
            <div className="job-details-content">
              <p>
                {[job.location, job.salaryString].filter(Boolean).join(" ? ")}
              </p>
              <FormField label="Application stage"><NativeSelect
                  value={job.applicationStatus ?? "revealed"}
                  onChange={(e) => void setStage(e.target.value)}
                >
                  {applicationStatusMetadata.map((s) => (
                    <NativeSelectOption key={s.value} value={s.value}>
                      {s.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect></FormField>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSourceOpen(true)}
              >
                Original source
              </Button>
              {(job.finalUrl || job.url || job.sourceUrl) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void openUrl(job.finalUrl || job.url || job.sourceUrl || "")
                  }
                >
                  Open posting
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("Company Research")}
              >
                Company Research
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("Activity")}
              >
                Activity
              </Button>
              <details className="preparation-settings">
                <summary>
                  Run details
                </summary>
                {runStatus && <p>{runStatus}</p>}

              </details>
            </div>
          </details>
        </div>
        <nav className="flex flex-wrap gap-2 border-b pb-4" aria-label="Application preparation steps">
          <Button variant="outline" className="aria-[current=step]:bg-accent aria-[current=step]:text-accent-foreground" aria-current={view.destination === "Targets" ? "step" : undefined} onClick={() => navigate("Targets")}><span>{allConfirmed ? <Check /> : "1"}</span> Requirements</Button>
          <Button variant="outline" className="aria-[current=step]:bg-accent aria-[current=step]:text-accent-foreground" aria-current={view.destination === "Tasks" ? "step" : undefined} onClick={() => navigate("Tasks")}><span>2</span> Preparation tasks</Button>
          <Button variant="outline" onClick={() => navigate("Resume")}><FileText /> Resume editor</Button>
        </nav>
      </header>
      {error && (
        <div role="alert" className="workspace-error">
          {error}
          <Button size="sm" variant="outline" onClick={() => setError("")}>
            Dismiss
          </Button>
        </div>
      )}
      <div className="job-preparation-body">
        {view.destination === "Targets" && (
          <div className="workspace-ai-controls" role="group" aria-label="AI model and reasoning">
            <span>Model &amp; reasoning</span>
            <ModelReasoningSelector value={selection} onChange={changeSelection} disabled={busy} />
          </div>
        )}
        {!workspace ? (
          <p role="status" className="p-8">
            {error ? "Preparation could not be loaded." : "Loading workspace…"}
          </p>
        ) : (
          <>
            {busy && (
              <div className="workspace-runbar" role="status">
                <LoaderCircle className="size-4 animate-spin" />
                <span>
                  {backgroundTask?.status === "running" ? backgroundTask.stage : "Saving your changes..."}
                </span>
                {runId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void cancelWorkspaceRun(runId)}
                  >
                    Cancel run
                  </Button>
                )}
              </div>
            )}
            <div className="workspace-reasoning">
              <BackgroundActivityPreview taskKey={`job-workspace-${job.id}`} expandToContent />
            </div>
            {view.destination === "Targets" && (
              <div className="targets-layout">
                <section className="targets-main">
                  <div className="preparation-intro">
                    <h2>What this role asks of you</h2>
                    <p>Review the requirements and use your preparation tasks to plan the work.</p>
                  </div>
                  {targets.length > 0 && <section className="preparation-next" aria-label="Current preparation step">
                    <div aria-live="polite"><strong>{confirmedCount} of {targets.length} requirements confirmed</strong><p>{allConfirmed ? "Your preparation tasks are ready to work through." : "Use the posting excerpt on each card to check it."}</p></div>
                    <Button onClick={() => navigate("Tasks")}>View preparation tasks</Button>
                    <Progress value={targets.length ? confirmedCount / targets.length * 100 : 0} aria-label="Requirements confirmed" />
                  </section>}
                  {analysisStale && (
                    <section className="workspace-notice" role="status">
                      <p>
                        The posting changed. Refresh the requirements before
                        confirming them.
                      </p>
                      <Button
                        disabled={busy || selection.provider !== "codex"}
                        onClick={() => void run("analyze")}
                      >
                        Analyze updated posting
                      </Button>
                    </section>
                  )}
                  {workspace.candidate && (
                    <section className="workspace-notice">
                      <h3>Review updated analysis</h3>
                      <p>
                        {workspace.candidate.analysis.targets.length} proposed
                        targets ·{" "}
                        {
                          workspace.candidate.analysis.targets.filter((t) =>
                            workspace.checklist?.analysis.targets.some(
                              (old) => old.id === t.id,
                            ),
                          ).length
                        }{" "}
                        unchanged identities
                      </p>
                      <details>
                        <summary>Compare targets</summary>
                        <div className="proposal-columns">
                          <div>
                            <h4>Current</h4>
                            {workspace.checklist?.analysis.targets.map((t) => (
                              <p key={t.id}>{t.title}</p>
                            ))}
                          </div>
                          <div>
                            <h4>Proposed</h4>
                            {workspace.candidate.analysis.targets.map((t) => (
                              <p key={t.id}>
                                {t.title} · {t.grounding}
                              </p>
                            ))}
                          </div>
                        </div>
                      </details>
                      <div className="flex gap-2">
                        <Button
                          disabled={busy}
                          onClick={() => void change("acceptAnalysis", {})}
                        >
                          Accept analysis
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => void change("rejectAnalysis", {})}
                        >
                          Keep current
                        </Button>
                      </div>
                    </section>
                  )}
                  {workspace.checklist?.analysis.warnings.map((warning, i) => (
                    <p role="status" className="workspace-notice" key={i}>
                      {warning}
                    </p>
                  ))}
                  {!workspace.checklist && (
                    <section className="unanalyzed-job">
                      <FileText />
                      <h3>Start with the employer’s words</h3>
                      <p>
                        Decode the full posting into traceable targets. Your
                        Career Profile is not required.
                      </p>
                      <details>
                        <summary>Read the posting</summary>
                        <p className="source-excerpt">
                          {workspace.source.text ||
                            "Paste the complete posting to begin."}
                        </p>
                      </details>
                      <Button
                        disabled={
                          busy ||
                          selection.provider !== "codex" ||
                          !workspace.source.text.trim()
                        }
                        onClick={() => void run("analyze")}
                      >
                        Analyze job
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setSourceOpen(true)}
                      >
                        Correct or paste posting
                      </Button>
                    </section>
                  )}
                  {selection.provider !== "codex" && (
                    <p className="workspace-notice">
                      Analyze requires Codex local-skill support. Manual review
                      and preparation tasks remain available.
                    </p>
                  )}
                  {targets.length > 0 && (
                    <>
                      <div className="target-list-tools">
                        <span>
                          Requirements{" "}
                          <small>{targets.length}</small>
                        </span>
                        <div>
                          <NativeSelect
                            aria-label="Target filter"
                            value={activeFilter}
                            onChange={(e) =>
                              updateView({ filter: e.target.value })
                            }
                          >
                            {filters.map((f) => (
                              <NativeSelectOption key={f}>{f}</NativeSelectOption>
                            ))}
                          </NativeSelect>
                          <details className="target-more-actions">
                            <summary>More options</summary>
                            <div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => editTarget(emptyTarget())}
                              >
                                <Plus /> Add target
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={
                                  busy || selection.provider !== "codex"
                                }
                                onClick={() => void run("analyze")}
                              >
                                Reanalyze
                              </Button>
                            </div>
                          </details>
                        </div>
                      </div>
                      <div
                        className="target-list"
                        aria-label="Job target checklist"
                      >
                        {visibleTargets.map((t) => {
                          const confirmed = requirementConfirmed(workspace, t)
                          const tone = confirmed ? "confirmed" : "pending"
                          return (
                            <article
                              className="target-row"
                              data-state={tone}
                              key={t.id}
                            >
                              <div
                                className="target-taskbar"
                                aria-label={`Progress for ${t.title}`}
                              >
                                <span className="target-state" role="status">
                                  {confirmed ? "Requirement confirmed" : "To confirm"}
                                </span>
                                <Button size="sm" variant="ghost" disabled={busy || analysisStale}
                                  aria-label={`${confirmed ? "Undo confirmation of" : "Confirm requirement:"} ${t.title}`}
                                  onClick={() => void change("confirmTarget", { targetId: t.id, confirmed: !confirmed })}>
                                  {confirmed ? "Confirmed" : "Confirm"} <Check />
                                </Button>
                              </div>
                              <div className="target-card-content">
                                <Button variant="ghost"
                                  className="target-row-open"
                                  data-target-id={t.id}
                                  onClick={(event) =>
                                    openTarget(t, event.currentTarget)
                                  }
                                >
                                  <strong>{t.title}</strong>
                                </Button>
                                <div className="target-excerpts">
                                  <section>
                                    <h3>From the posting</h3>
                                    {t.sources.length ? (
                                      t.sources.map((source, i) => (
                                        <blockquote key={i}>
                                          {source.quote}
                                        </blockquote>
                                      ))
                                    ) : (
                                      <p>Added by you. No posting excerpt.</p>
                                    )}
                                  </section>
                                </div>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                      {!visibleTargets.length && (
                        <p className="p-6">
                          No requirements match this filter.
                        </p>
                      )}
                    </>
                  )}
                  {workspace.overrides.some((o) => o.dismissed) && (
                    <details className="p-4">
                      <summary>Dismissed targets</summary>
                      {workspace.overrides
                        .filter((o) => o.dismissed)
                        .map((o) => (
                          <p key={o.targetId}>
                            {o.target.title}{" "}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                void change("target", {
                                  ...o,
                                  dismissed: false,
                                })
                              }
                            >
                              Restore
                            </Button>
                          </p>
                        ))}
                    </details>
                  )}
                </section>
              </div>
            )}
            {view.destination === "Tasks" && (
              <section className="workspace-documents">
                <h2>Preparation tasks</h2>
                <p>Work through the tasks for this role and update their status as you go.</p>
                {!workspace.actions.length && <p>Analyze the posting or add a target to create preparation tasks.</p>}
                {workspace.actions.filter(a => !a.targetIds.length || a.targetIds.some(id => targets.some(t => t.id === id))).map(a => (
                  <article className="proposal-row" key={a.id}>
                    <div><strong>{a.title}</strong><p>{a.completionCondition}</p></div>
                    <NativeSelect aria-label={`Status of ${a.title}`} value={a.status} disabled={busy}
                      onChange={event => void change("action", { ...a, status: event.target.value, reason: event.target.value === "Dismissed" ? "Dismissed by user" : a.reason })}>
                      {["To do", "In progress", "Blocked", "Done", "Dismissed"].map(status => <NativeSelectOption key={status}>{status}</NativeSelectOption>)}
                    </NativeSelect>
                  </article>
                ))}
                <Button variant="outline" onClick={() => editTarget(emptyTarget())}><Plus /> Add target</Button>
              </section>
            )}
            {view.destination === "Company Research" && (
              <CompanyResearchWorkspace job={job} />
            )}
            {view.destination === "Activity" && (
              <section className="workspace-activity">
                <h2>Preparation activity</h2>
                {!workspace.activity.length && (
                  <p>
                    No operations yet. Viewing a job does not start a provider
                    run.
                  </p>
                )}
                {[...workspace.activity].reverse().map((a) => (
                  <article key={a.id}>
                    <time>{new Date(a.time).toLocaleString()}</time>
                    <strong>
                      {a.operation} · {a.status}
                    </strong>
                    <p>{a.message}</p>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </div>
      <Dialog
        open={!!target && view.destination === "Targets"}
        onOpenChange={(open) => {
          if (!open) closeInspector()
        }}
      >
        <DialogContent
          className="target-inspector-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            targetButton.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{target?.title}</DialogTitle>
            <DialogDescription>
              Check this requirement before confirming it.
            </DialogDescription>
          </DialogHeader>
          {inspector}
        </DialogContent>
      </Dialog>
      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent className="workspace-source-dialog">
          <DialogHeader>
            <DialogTitle>Original posting and corrections</DialogTitle>
            <DialogDescription>
              Original text is retained when saving a correction.
            </DialogDescription>
          </DialogHeader>
          <details>
            <summary>Original imported text</summary>
            <pre className="whitespace-pre-wrap text-sm">
              {workspace?.source.original || job.description}
            </pre>
          </details>
          <FormField label="Current posting"><Textarea
              rows={16}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
            /></FormField>
          <Button
            disabled={busy || !sourceText.trim()}
            onClick={() =>
              void change("source", { text: sourceText }).then((next) => {
                if (next) {
                  onJobChange?.({ ...job, description: sourceText })
                  setSourceOpen(false)
                }
              })
            }
          >
            Save posting revision
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "Edit target" : "Add personal target"}
            </DialogTitle>
            <DialogDescription>
              Personal targets retain their provenance. Merged and split targets
              retain source lineage and need fresh reviews.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="target-edit-form">
              <FormField label="Title"><Input
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                /></FormField>
              <FormField label="Meaning"><Textarea
                  value={editing.interpretation}
                  onChange={(e) =>
                    setEditing({ ...editing, interpretation: e.target.value })
                  }
                /></FormField>
              <FormField label="Priority"><NativeSelect
                  value={editing.priority}
                  onChange={(e) =>
                    setEditing({ ...editing, priority: e.target.value })
                  }
                >
                  {["Must hit", "High", "Medium", "Bonus"].map((p) => (
                    <NativeSelectOption key={p}>{p}</NativeSelectOption>
                  ))}
                </NativeSelect></FormField>
              {splitRemainder && (
                <>
                  <FormField label="Second target title"><Input
                      value={splitRemainder.title}
                      onChange={(e) =>
                        setSplitRemainder({
                          ...splitRemainder,
                          title: e.target.value,
                        })
                      }
                    /></FormField>
                  <FormField label="Second target meaning"><Textarea
                      value={splitRemainder.interpretation}
                      onChange={(e) =>
                        setSplitRemainder({
                          ...splitRemainder,
                          interpretation: e.target.value,
                        })
                      }
                    /></FormField>
                  <p>
                    Both targets retain the original sources and get their own preparation tasks.
                  </p>
                </>
              )}
              <TargetCriteriaEditor target={editing} onChange={setEditing} />
              {splitRemainder && (
                <TargetCriteriaEditor
                  target={splitRemainder}
                  onChange={setSplitRemainder}
                />
              )}
              <FormField label="Notes / interview preparation"><Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                /></FormField>
              <Button
                disabled={
                  busy ||
                  (!!splitRemainder &&
                    (!splitRemainder.title.trim() ||
                      !splitRemainder.interpretation.trim())) ||
                  !editing.title.trim() ||
                  !editing.interpretation.trim()
                }
                onClick={() =>
                  void change(
                    splitRemainder ? "splitTarget" : "target",
                    splitRemainder
                      ? {
                          sourceId: lineage[0],
                          targets: [editing, splitRemainder],
                          note,
                        }
                      : {
                          target: editing,
                          note,
                          lineage,
                          dismissed: false,
                        },
                  ).then((next) => {
                    if (next) {
                      setEditing(null)
                      updateView({ targetId: "" })
                    }
                  })
                }
              >
                Save target
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
