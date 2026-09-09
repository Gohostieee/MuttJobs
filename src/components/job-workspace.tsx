import { DocumentProposalChanges } from "./document-proposal-changes"
import { DocumentCreationProgress } from "./document-creation-progress"
import { BackgroundActivityPreview } from "./background-activity"
import { useBackgroundActivity } from "@/lib/background-activity"
import { useCallback, useEffect, useRef, useState } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { invoke } from "@tauri-apps/api/core"
import { TargetCriteriaEditor } from "./target-criteria-editor"
import type { ResumeAiSelection } from "@/lib/resume-ai"
import type { WorkspaceMutations } from "@/lib/job-workspace"
import {
  ArrowLeft,
  ArrowRight,
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
import { TargetMatchReview } from "@/components/target-match-review"
import { TargetCoverageReview } from "@/components/target-coverage-review"
import { ResumeViewer } from "@/components/resume-workspace"
import { CoverLetterViewer } from "@/components/cover-letter-workspace"
import { ResumeDocument } from "@/components/resume-document"
import { CoverLetterDocument } from "@/components/cover-letter-document"
import {
  DEFAULT_RESUME_AI_SELECTION,
  ModelReasoningSelector,
} from "@/components/resume-ai-sidebar"
import { loadJobPrimaryResume } from "@/lib/resume-storage"
import { loadOrCreateJobCoverLetter } from "@/lib/cover-letter-storage"
import { normalizeAndValidateResume } from "@/lib/resume-validation"
import { normalizeAndValidateCoverLetter } from "@/lib/cover-letter-validation"
import type { ResumeFile } from "@/lib/resume-types"
import type { CoverLetterFile } from "@/lib/cover-letter-types"
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
  type Proposal,
} from "@/lib/job-workspace"
import {
  requirementConfirmed,
  targetProgress,
} from "@/lib/job-preparation-flow"
import "./job-workspace.css"

const destinations = [
  "Targets",
  "Documents",
  "Company Research",
  "Activity",
] as const
type ViewState = {
  destination: (typeof destinations)[number]
  targetId: string
  artifact: string
  filter: string
  scroll: number
  step: "requirements" | "match"
}
function restoredView(id: number): ViewState {
  const defaults: ViewState = {
    destination: "Targets",
    targetId: "",
    artifact: "resume",
    filter: "All targets",
    scroll: 0,
    step: "requirements",
  }
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem(`muttjobs.job-view.${id}`) || "{}"),
    }
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
  const creationWrites = useRef<Promise<unknown>>(Promise.resolve())
  function creationMutation<K extends keyof WorkspaceMutations>(operation: K, payload: WorkspaceMutations[K]) {
    const pending = creationWrites.current.catch(() => {}).then(async () => {
      const current = await readJobWorkspace(job.id)
      if (operation === "creationLayout") {
        const measurement = payload as WorkspaceMutations["creationLayout"]
        const session = current.creationSessions?.find((item) => item.id === measurement.id)
        if (session?.revision !== measurement.draftRevision || !["Ready for review", "Paused for input"].includes(session.state)) return current
      }
      return mutateJobWorkspace(current, operation, payload)
    })
    creationWrites.current = pending
    return pending
  }
  const [view, setView] = useState(() => restoredView(job.id))
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
  const [resume, setResume] = useState<ResumeFile | null>(null)
  const [letter, setLetter] = useState<CoverLetterFile | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [editingProposal, setEditingProposal] = useState(false)
  const [currentDocument, setCurrentDocument] = useState<unknown>(null)
  const [includeResearch, setIncludeResearch] = useState(false)
  const [inspectorTab, setInspectorTab] = useState(() =>
    restoredView(job.id).step === "match" ? "evidence" : "requirement",
  )
  const [runningOperation, setRunningOperation] =
    useState<WorkspaceOperation | null>(null)
  const [field, setField] = useState("")
  const [quote, setQuote] = useState("")
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
  const creation = workspace?.creationSessions?.findLast((s) => s.artifact === view.artifact)
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
      const next = await (operation.toLowerCase().includes("creation") || operation === "acceptProposal" || operation === "rejectProposal"
        ? creationMutation(operation, payload)
        : mutateJobWorkspace(workspace, operation, payload))
      setWorkspace(next)
      return next
    } catch (cause) {
      setError(workspaceError(cause))
    } finally {
      setBusy(false)
    }
  }
  async function approveTargetEvidence(targetId: string) {
    if (!workspace || busy) return
    const pending = workspace.evidence.filter((e) =>
      e.suggestion.targetId === targetId &&
      e.review !== "Confirmed" && e.review !== "Rejected" &&
      ["Strong", "Partial"].includes(e.suggestion.strength) &&
      e.suggestion.references.length > 0,
    )
    setBusy(true)
    setError("")
    try {
      let latest = workspace
      for (const evidence of pending) {
        latest = await mutateJobWorkspace(latest, "evidenceReview", {
          id: evidence.id, review: "Confirmed",
        })
        setWorkspace(latest)
      }
    } catch (cause) {
      setError(workspaceError(cause))
    } finally {
      setBusy(false)
    }
  }
  async function run(operation: WorkspaceOperation, runSelection = selection, current = workspace) {
    if (!current || busy) return
    const id = crypto.randomUUID()
    setRunId(id)
    setRunningOperation(operation)
    setBusy(true)
    setError("")
    setRunStatus("Starting…")
    try {
      let start = current
      if (["prepare", "resumeCreation", "audit"].includes(operation)) {
        await creationWrites.current.catch(() => {})
        start = await readJobWorkspace(job.id)
      }
      setWorkspace(
        await runWorkspace(
          start,
          operation,
          runSelection,
          id,
          [],
          view.artifact,
          includeResearch,
        ),
      )
      setRunStatus(
        operation === "match"
          ? "Profile matching finished. Review the results below."
          : "Saved for review",
      )
      if (operation === "match")
        updateView({ step: "match", targetId: "", filter: "All targets" })
    } catch (cause) {
      setError(workspaceError(cause))
      setRunStatus("Previous work retained")
    } finally {
      void readJobWorkspace(job.id).then(setWorkspace).catch(() => {})
      setBusy(false)
      setRunId("")
      setRunningOperation(null)
    }
  }
  async function openEditor() {
    try {
      if (view.artifact === "resume")
        setResume(await loadJobPrimaryResume(job.id))
      else setLetter(await loadOrCreateJobCoverLetter(job))
    } catch (cause) {
      setError(workspaceError(cause))
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
  const step = allConfirmed && view.step === "match" ? "match" : "requirements"
  const matching =
    runningOperation === "match" ||
    (backgroundTask?.status === "running" && backgroundTask.title === "Job match")
  const results = workspace
    ? targets.map((t) => targetProgress(workspace, t, view.artifact))
    : []
  const assessedCount = results.filter((r) => r.evidence.length > 0).length
  const supportedCount = results.filter((r) => r.supported).length
  const approvedCount = results.filter((r) => r.approved).length
  const reviewCount = results.filter((r) => r.supported && !r.approved).length
  const filters = step === "requirements"
    ? ["All targets", "To confirm"]
    : ["All targets", "Evidence to review", "Profile gaps"]
  const activeFilter = filters.includes(view.filter) ? view.filter : "All targets"
  const visibleTargets = targets.filter(
    (_, i) =>
      activeFilter === "All targets" ||
      (activeFilter === "To confirm" && !results[i].confirmed) ||
      (activeFilter === "Evidence to review" &&
        results[i].supported &&
        !results[i].approved) ||
      (activeFilter === "Profile gaps" &&
        results[i].evidence.length > 0 &&
        !results[i].supported),
  )
  function navigate(
    destination: ViewState["destination"],
    nextStep = view.step,
  ) {
    updateView({
      destination,
      step: nextStep,
      targetId: "",
      filter: "All targets",
      scroll: 0,
    })
    content.current?.scrollTo({ top: 0 })
    setResume(null)
    setLetter(null)
  }
  function openTarget(t: Target, button: HTMLButtonElement) {
    targetButton.current = button
    setInspectorTab(step === "requirements" ? "requirement" : "evidence")
    updateView({ targetId: t.id })
  }
  const inspector =
    target && workspace ? (
      <div className="target-inspector-content">
        <div className="target-detail-tabs" aria-label="Requirement details">
          {[
            ["requirement", "Requirement"],
            ["evidence", "Profile evidence"],
            ["document", "Document"],
            ["options", "Options"],
          ]
            .filter(
              ([id]) =>
                step !== "requirements" ||
                id === "requirement" ||
                id === "options",
            )
            .map(([id, label]) => (
              <button
                key={id}
                aria-pressed={inspectorTab === id}
                aria-controls={`target-panel-${id}`}
                id={`target-tab-${id}`}
                onClick={() => setInspectorTab(id)}
              >
                {label}
              </button>
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
              <button
                className="target-quote"
                key={i}
                onClick={() => setSourceOpen(true)}
              >
                <blockquote>{s.quote}</blockquote>
                <small>Original source · {s.paragraphId}</small>
              </button>
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
            <h3>Suggested proof</h3>
            <ul>
              {target.evidenceExpectations.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <small>
              Examples to look for, not facts about your experience.
            </small>
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
        {inspectorTab === "evidence" && (
          <section
            className="target-detail-panel"
            id="target-panel-evidence"
            aria-labelledby="target-tab-evidence"
          >
            <TargetMatchReview
              key={target.id}
              target={target}
              evidence={workspace.evidence.filter((e) => e.suggestion.targetId === target.id)}
              disabled={busy}
              onDone={closeInspector}
              onMatch={() => void run("match")}
              onReview={(id, review) => void change("evidenceReview", { id, review })}
              onLink={async (suggestion) => {
                setBusy(true)
                try {
                  const latest = await readJobWorkspace(job.id)
                  setWorkspace(await mutateJobWorkspace(latest, "linkEvidence", suggestion))
                } finally {
                  setBusy(false)
                }
              }}
            />
          </section>
        )}
        {inspectorTab === "document" && (
          <section
            className="target-detail-panel"
            id="target-panel-document"
            aria-labelledby="target-tab-document"
          >
            <h3>
              Coverage in{" "}
              {view.artifact === "resume" ? "primary resume" : "cover letter"}
            </h3>
            {workspace.coverage
              .filter(
                (c) =>
                  c.placement.targetId === target.id &&
                  c.artifact === view.artifact,
              )
              .map((c) => (
                <section className="target-evidence" key={c.id}>
                  <Badge variant="outline">{c.status}</Badge>
                  <blockquote>{c.placement.quote}</blockquote>
                  <small>
                    Verify this passage truthfully demonstrates the target.
                  </small>
                  <TargetCoverageReview
                    target={target}
                    disabled={
                      busy ||
                      c.status === "Addressed" ||
                      c.status === "Needs review"
                    }
                    onReview={(criteria) =>
                      void change("coverageReview", { id: c.id, criteria })
                    }
                  />
                </section>
              ))}
            <details>
              <summary>Locate a placement manually</summary>
              <label>
                Document field
                <input
                  placeholder="/summary/content"
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                />
              </label>
              <label>
                Exact saved passage
                <textarea
                  value={quote}
                  onChange={(e) => setQuote(e.target.value)}
                />
              </label>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void change("placement", {
                    artifact: view.artifact,
                    placement: {
                      targetId: target.id,
                      field,
                      quote,
                      evidenceIds: workspace.evidence
                        .filter(
                          (e) =>
                            e.suggestion.targetId === target.id &&
                            e.review === "Confirmed",
                        )
                        .map((e) => e.id),
                    },
                  })
                }
              >
                Verify placement
              </Button>
            </details>
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
                  <select
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
                      <option key={s}>{s}</option>
                    ))}
                  </select>
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
              <label>
                Application stage
                <select
                  value={job.applicationStatus ?? "revealed"}
                  onChange={(e) => void setStage(e.target.value)}
                >
                  {applicationStatusMetadata.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
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
        <nav
          className="preparation-steps"
          aria-label="Application preparation steps"
        >
          <button
            aria-current={
              view.destination === "Targets" && step === "requirements"
                ? "step"
                : undefined
            }
            onClick={() => navigate("Targets", "requirements")}
          >
            <span>{allConfirmed ? <Check /> : "1"}</span> Confirm requirements
          </button>
          <button
            disabled={!allConfirmed}
            aria-current={
              view.destination === "Targets" && step === "match"
                ? "step"
                : undefined
            }
            onClick={() => navigate("Targets", "match")}
          >
            <span>2</span> Match your profile
          </button>
          <button
            aria-current={view.destination === "Documents" ? "step" : undefined}
            onClick={() => navigate("Documents")}
          >
            <span>3</span> Documents
          </button>
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
        {(view.destination === "Targets" || view.destination === "Documents") && (
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
                  {matching
                    ? "Matching your profile to each requirement..."
                    : (backgroundTask?.status === "running" ? backgroundTask.stage : "Saving your changes...")}
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
                    <h2>
                      {step === "requirements"
                        ? "What this role asks of you"
                        : matching
                          ? "Finding your experience."
                          : assessedCount
                            ? "Your experience, matched."
                            : "Connect your experience."}
                    </h2>
                    <p>
                      {step === "requirements"
                        ? "Confirm each requirement belongs in your application. You’ll review your experience in the next step."
                        : assessedCount
                          ? "Matching suggests evidence from your Career Profile. Review it before using it in a document."
                          : "We will look through your Career Profile for experience that supports each confirmed requirement."}
                    </p>
                  </div>
                  {targets.length > 0 && (
                    <section
                      className="preparation-next"
                      aria-label="Current preparation step"
                    >
                      <div aria-live="polite">
                        <strong>
                          {step === "requirements"
                            ? `${confirmedCount} of ${targets.length} requirements confirmed`
                            : matching
                              ? "Matching in progress"
                              : assessedCount
                                ? `${supportedCount} with supporting evidence / ${assessedCount - supportedCount} need profile details`
                                : `${targets.length} requirements ready to match`}
                        </strong>
                        <p>
                          {step === "requirements"
                            ? allConfirmed
                              ? "Next, find the experience to support them."
                              : "Use the posting excerpt on each card to check it."
                            : matching
                              ? "You can leave this page. Your results will be saved here."
                              : assessedCount
                                ? `${approvedCount} evidence reviews confirmed${reviewCount ? ` / ${reviewCount} ready for review` : ""}. Matching does not edit your resume.`
                                : "Your documents stay as they are until you review and accept a proposal."}
                        </p>
                      </div>
                      {step === "requirements" ? (
                        <Button
                          disabled={!allConfirmed || busy}
                          onClick={() => navigate("Targets", "match")}
                        >
                          Continue to matching <ArrowRight />
                        </Button>
                      ) : assessedCount < targets.length ? (
                        <Button
                          disabled={busy}
                          onClick={() => void run("match")}
                        >
                          Match Career Profile <ArrowRight />
                        </Button>
                      ) : reviewCount > 0 ? (
                        <Button
                          disabled={busy}
                          onClick={() => {
                            const next = targets.find(
                              (_, i) =>
                                results[i].supported && !results[i].approved,
                            )
                            if (next) {
                              targetButton.current =
                                content.current?.querySelector<HTMLButtonElement>(
                                  `.target-row-open[data-target-id="${CSS.escape(next.id)}"]`,
                                ) ?? null
                              setInspectorTab("evidence")
                              updateView({ targetId: next.id })
                            }
                          }}
                        >
                          Review next match <ArrowRight />
                        </Button>
                      ) : (
                        <Button
                          disabled={busy || !approvedCount || reviewCount > 0}
                          onClick={() => navigate("Documents")}
                        >
                          Continue to documents <ArrowRight />
                        </Button>
                      )}
                      {step === "requirements" && (
                        <progress
                          max={targets.length}
                          value={confirmedCount}
                          aria-label="Requirements confirmed"
                        />
                      )}
                    </section>
                  )}
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
                      and supported document operations remain available.
                    </p>
                  )}
                  {targets.length > 0 && (
                    <>
                      <div className="target-list-tools">
                        <span>
                          {step === "requirements"
                            ? "Requirements"
                            : "Match results"}{" "}
                          <small>{targets.length}</small>
                        </span>
                        <div>
                          <select
                            aria-label="Target filter"
                            value={activeFilter}
                            onChange={(e) =>
                              updateView({ filter: e.target.value })
                            }
                          >
                            {filters.map((f) => (
                              <option key={f}>{f}</option>
                            ))}
                          </select>
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
                              {step === "match" && assessedCount > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => void run("match")}
                                >
                                  Match Career Profile again
                                </Button>
                              )}
                            </div>
                          </details>
                        </div>
                      </div>
                      <div
                        className="target-list"
                        aria-label="Job target checklist"
                      >
                        {visibleTargets.map((t) => {
                          const state = targetProgress(
                            workspace,
                            t,
                            view.artifact,
                          )
                          const tone = matching
                            ? "matching"
                            : !state.confirmed
                              ? "pending"
                              : state.approved || state.addressed
                                ? "confirmed"
                                : state.supported
                                  ? "review"
                                  : state.evidence.length
                                    ? "gap"
                                    : "ready"
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
                                  {matching
                                    ? "Matching profile..."
                                    : state.status}
                                </span>
                                {step === "requirements" ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busy || analysisStale}
                                    aria-label={`${state.confirmed ? "Undo confirmation of" : "Confirm requirement:"} ${t.title}`}
                                    onClick={() =>
                                      void change("confirmTarget", {
                                        targetId: t.id,
                                        confirmed: !state.confirmed,
                                      })
                                    }
                                  >
                                    {state.confirmed ? (
                                      <>
                                        <Check /> Confirmed
                                      </>
                                    ) : (
                                      <>
                                        Confirm <Check />
                                      </>
                                    )}
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={(event) => {
                                      if (state.supported && !state.approved)
                                        void approveTargetEvidence(t.id)
                                      else openTarget(t, event.currentTarget)
                                    }}
                                  >
                                    {state.approved
                                      ? "View evidence"
                                      : state.supported
                                        ? "Approve evidence"
                                        : "Add details"}{" "}
                                    <ArrowRight />
                                  </Button>
                                )}
                              </div>
                              <div className="target-card-content">
                                <button
                                  className="target-row-open"
                                  data-target-id={t.id}
                                  onClick={(event) =>
                                    openTarget(t, event.currentTarget)
                                  }
                                >
                                  <strong>{t.title}</strong>
                                </button>
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
                                  {state.evidence.length > 0 && (
                                    <section className="target-match-excerpt">
                                      <h3>Career Profile match</h3>
                                      {state.evidence.map((e) => (
                                        <div key={e.id}>
                                          {e.suggestion.references.length ? (
                                            e.suggestion.references.map(
                                              (reference, i) => (
                                                <blockquote key={i}>
                                                  {reference.excerpt}
                                                </blockquote>
                                              ),
                                            )
                                          ) : (
                                            <p>
                                              No documented match found. Add
                                              relevant experience to your Career
                                              Profile and match again.
                                            </p>
                                          )}
                                          {(e.review === "Rejected" ||
                                            e.review === "Needs review") && (
                                            <small>
                                              {e.review === "Rejected"
                                                ? "Rejected match"
                                                : "Changed since review - verify again"}
                                            </small>
                                          )}
                                        </div>
                                      ))}
                                    </section>
                                  )}
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
            {view.destination === "Documents" && (
              <section className="workspace-documents">
                <div className="targets-heading">
                  <div>
                    <p className="job-eyebrow">Truthful, targeted materials</p>
                    <h2>Documents</h2>
                    <p>
                      Use confirmed evidence to create a proposal, then review
                      it before saving.
                    </p>
                  </div>
                  <select
                    aria-label="Document type"
                    value={view.artifact}
                    onChange={(e) => {
                      updateView({ artifact: e.target.value })
                      setResume(null)
                      setLetter(null)
                    }}
                  >
                    <option value="resume">Primary resume</option>
                    <option value="coverLetter">Cover letter (optional)</option>
                  </select>
                </div>
                <div className="target-toolbar">
                  <Button
                    disabled={
                      busy || !allConfirmed || !approvedCount
                    }
                    onClick={() => void run("prepare")}
                  >
                    {view.artifact === "resume" ? "Create tailored resume" : "Create cover letter"}
                  </Button>
                  <details className="document-options">
                    <summary>Document options</summary>
                    <label>
                      <input
                        type="checkbox"
                        checked={includeResearch}
                        onChange={(event) =>
                          setIncludeResearch(event.target.checked)
                        }
                      />{" "}
                      Include saved Company Research (optional employer context)
                    </label>
                    <Button
                      variant="outline"
                      disabled={busy || !targets.length}
                      onClick={() => void run("audit")}
                    >
                      Assess saved document
                    </Button>
                    <Button variant="outline" onClick={() => void openEditor()}>
                      Open document editor
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void change("createDraft", { artifact: view.artifact })
                      }
                    >
                      Start a blank draft
                    </Button>
                  </details>
                </div>
                {(!allConfirmed || !approvedCount) && (
                  <div className="workspace-notice">
                    <p>
                      {!allConfirmed
                        ? "Confirm the requirements first."
                        : reviewCount > 0
                          ? "Review your suggested profile evidence before preparing a document."
                          : "Confirm at least one supporting profile match before preparing a document."}
                    </p>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        navigate(
                          "Targets",
                          allConfirmed ? "match" : "requirements",
                        )
                      }
                    >
                      Return to{" "}
                      {allConfirmed ? "profile matching" : "requirements"}{" "}
                      <ArrowRight />
                    </Button>
                  </div>
                )}
                {creation && <DocumentCreationProgress session={creation} busy={busy}
                  onRevise={(text) => void change("queueCreationRepair", { id: creation.id, text }).then((next) => { if (next) void run("resumeCreation", { provider: creation.provider, model: creation.model, effort: creation.effort } as ResumeAiSelection, next) })}
                  onOmit={(target) => void change("omitCreationTarget", { id: creation.id, target }).then((next) => { if (next) void run("resumeCreation", { provider: creation.provider, model: creation.model, effort: creation.effort } as ResumeAiSelection, next) })}
                  onPin={(pinned) => void change("pinCreation", { id: creation.id, pinned })}
                  onRebase={() => void change("rebaseCreation", { id: creation.id, keepSavedEdits: true })}
                  onDiscard={() => void change("discardCreation", { id: creation.id })}
                  onPageMode={(pageMode) => void change("creationPageMode", { id: creation.id, pageMode })}
                  onResume={() => void run("resumeCreation", { provider: creation.provider, model: creation.model, effort: creation.effort } as ResumeAiSelection)}
                  onCancel={() => void cancelWorkspaceRun(creation.attempt).catch((cause) => setError(workspaceError(cause)))}
                  onLayout={(measurement) => {
                    void creationMutation("creationLayout", { id: creation.id, draftRevision: creation.revision, ...measurement }).then(setWorkspace).catch((cause) => setError(workspaceError(cause)))
                  }}
                  onGap={(targetId) => { updateView({ destination: "Targets", step: "match", targetId }); setInspectorTab("evidence") }} />}
                {workspace.creationSessions?.some((session) => ["Rejected", "Failed"].includes(session.state) && !session.pinned) && <Button variant="ghost" disabled={busy} onClick={() => void change("clearCreationHistory", {})}>Clear failed and discarded draft history</Button>}
                {workspace.proposals
                  .filter((p) => p.artifact === view.artifact)
                  .map((p) => (
                    <article className="proposal-row" key={p.id}>
                      <div>
                        <strong>Document proposal</strong>
                        <p>
                          {p.status} · {new Date(p.createdAt).toLocaleString()}{" "}
                          · {p.placements.length} suggested placements
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setCurrentDocument(null)
                          void invoke("job_workspace_document", {
                            jobId: job.id,
                            artifact: p.artifact,
                          })
                            .then((data) => {
                              setCurrentDocument(data)
                              setEditingProposal(false)
                              setProposal(p)
                            })
                            .catch((cause) => setError(workspaceError(cause)))
                        }}
                      >
                        Review proposal
                      </Button>
                    </article>
                  ))}
                {resume && (
                  <ResumeViewer
                    file={resume}
                    targetJobId={job.id}
                    backLabel="Close editor"
                    onBack={() => {
                      setResume(null)
                      void refresh()
                    }}
                  />
                )}
                {letter && (
                  <CoverLetterViewer
                    file={letter}
                    targetJobId={job.id}
                    backLabel="Close editor"
                    onBack={() => {
                      setLetter(null)
                      void refresh()
                    }}
                  />
                )}
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
              {step === "requirements"
                ? "Check this requirement before confirming it."
                : "Match your experience to this requirement."}
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
          <label>
            Current posting
            <textarea
              rows={16}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
            />
          </label>
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
              <label>
                Title
                <input
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                />
              </label>
              <label>
                Meaning
                <textarea
                  value={editing.interpretation}
                  onChange={(e) =>
                    setEditing({ ...editing, interpretation: e.target.value })
                  }
                />
              </label>
              <label>
                Priority
                <select
                  value={editing.priority}
                  onChange={(e) =>
                    setEditing({ ...editing, priority: e.target.value })
                  }
                >
                  {["Must hit", "High", "Medium", "Bonus"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              {splitRemainder && (
                <>
                  <label>
                    Second target title
                    <input
                      value={splitRemainder.title}
                      onChange={(e) =>
                        setSplitRemainder({
                          ...splitRemainder,
                          title: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Second target meaning
                    <textarea
                      value={splitRemainder.interpretation}
                      onChange={(e) =>
                        setSplitRemainder({
                          ...splitRemainder,
                          interpretation: e.target.value,
                        })
                      }
                    />
                  </label>
                  <p>
                    Both targets retain the original sources. Evidence and
                    document coverage need separate review.
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
              <label>
                Notes / interview preparation
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
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
      <Dialog
        open={!!proposal}
        onOpenChange={(open) => {
          if (!open) setProposal(null)
        }}
      >
        <DialogContent className="workspace-proposal-dialog">
          <DialogHeader>
            <DialogTitle>Review document proposal</DialogTitle>
            <DialogDescription>
              Verify every claim. Coverage stays unreviewed until separately
              checked.
            </DialogDescription>
          </DialogHeader>
          {proposal && (
            <>
              {currentDocument != null && (
                <details>
                  <summary>View current saved document</summary>
                  <div className="proposal-preview">
                    {proposal.artifact === "resume" ? (
                      <ResumeDocument
                        resume={normalizeAndValidateResume(currentDocument)}
                      />
                    ) : (
                      <CoverLetterDocument
                        letter={normalizeAndValidateCoverLetter(
                          currentDocument,
                        )}
                      />
                    )}
                  </div>
                </details>
              )}
              <p>Proposed document · Unreviewed</p>
              <div className="proposal-preview">
                {proposal.artifact === "resume" ? (
                  <ResumeDocument
                    resume={normalizeAndValidateResume(proposal.data)}
                    onChange={editingProposal ? (data) => setProposal({ ...proposal, data }) : undefined}
                  />
                ) : (
                  <CoverLetterDocument
                    letter={normalizeAndValidateCoverLetter(proposal.data)}
                    onChange={editingProposal ? (data) => setProposal({ ...proposal, data }) : undefined}
                  />
                )}
              </div>
              <DocumentProposalChanges before={currentDocument} after={proposal.data} />
              <details>
                <summary>{proposal.placements.length} proposed coverage bindings</summary>
                {proposal.placements.map((placement, index) => <p key={index}>{targets.find((target) => target.id === placement.targetId)?.title}: {placement.quote.replace(/<[^>]*>/g, "")}</p>)}
                {creation?.proposalId === proposal.id && creation.plan.filter((item) => item.disposition !== "draft").map((item) => <p key={item.target}>Left out: {creation.targets.find((target) => target.handle === item.target)?.target.title}. {item.reason}</p>)}
              </details>
              <div className="proposal-actions flex flex-wrap gap-2">
                {error && <p role="alert" className="basis-full">{error}</p>}
                {creation?.proposalId === proposal.id && !creation.layout && <p role="status" className="basis-full">Checking the rendered pages before saving…</p>}
                {creation?.proposalId === proposal.id && <Button variant="outline" disabled={busy} onClick={() => {
                  if (!editingProposal) { setEditingProposal(true); return }
                  void change("editCreationDraft", { id: creation.id, draftRevision: creation.revision, data: proposal.data }).then((next) => {
                    const latest = next?.proposals.at(-1)
                    if (latest) { setProposal(latest); setEditingProposal(false) }
                  })
                }}>{editingProposal ? "Keep draft edits" : "Edit draft"}</Button>}
                <Button
                  disabled={busy || editingProposal || proposal.status !== "Unreviewed" || (creation?.proposalId === proposal.id && (!creation.layout || creation.layout.clipped || !creation.layout.readable || creation.layout.pages > (creation.pageMode === "two" ? 2 : 1)))}
                  onClick={() =>
                    void change("acceptProposal", { id: proposal.id }).then(
                      (next) => {
                        if (next) {
                          setProposal(null)
                          setResume(null)
                          setLetter(null)
                        }
                      },
                    )
                  }
                >
                  {proposal.artifact === "resume" ? "Save resume" : "Save cover letter"}
                </Button>
                <Button
                  disabled={busy || proposal.status !== "Unreviewed"}
                  variant="outline"
                  onClick={() =>
                    void change("rejectProposal", { id: proposal.id }).then(
                      (next) => {
                        if (next) setProposal(null)
                      },
                    )
                  }
                >
                  Discard
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
