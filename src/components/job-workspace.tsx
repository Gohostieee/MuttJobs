import { useCallback, useEffect, useRef, useState } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { listen } from "@tauri-apps/api/event"
import { invoke } from "@tauri-apps/api/core"
import { TargetCriteriaEditor } from "./target-criteria-editor"
import type { WorkspaceMutations } from "@/lib/job-workspace"
import { ArrowLeft, Check, FileText, LoaderCircle, Plus, X } from "lucide-react"
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
import { TargetEvidencePicker } from "@/components/target-evidence-picker"
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
  selected: string[]
  scroll: number
}
function restoredView(id: number): ViewState {
  const defaults: ViewState = {
    destination: "Targets",
    targetId: "",
    artifact: "resume",
    filter: "All targets",
    selected: [],
    scroll: 0,
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
}: {
  job: TheirStackJob
  onBack: () => void
  onJobChange?: (job: TheirStackJob) => void
  onDocumentViewerChange?: (open: boolean) => void
}) {
  const [workspace, setWorkspace] = useState<JobPreparation | null>(null)
  const [view, setView] = useState(() => restoredView(job.id))
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [runId, setRunId] = useState("")
  const [runStatus, setRunStatus] = useState("")
  const [selection, setSelection] = useState(DEFAULT_RESUME_AI_SELECTION)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceText, setSourceText] = useState("")
  const [editing, setEditing] = useState<Target | null>(null)
  const [splitRemainder, setSplitRemainder] = useState<Target | null>(null)
  const [lineage, setLineage] = useState<string[]>([])
  const [note, setNote] = useState("")
  const [resume, setResume] = useState<ResumeFile | null>(null)
  const [letter, setLetter] = useState<CoverLetterFile | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [currentDocument, setCurrentDocument] = useState<unknown>(null)
  const [includeResearch, setIncludeResearch] = useState(false)
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1100)
  const [field, setField] = useState("")
  const [quote, setQuote] = useState("")
  const content = useRef<HTMLDivElement>(null)
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
    const query = matchMedia("(max-width: 1099px)")
    const update = () => setNarrow(query.matches)
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  useEffect(() => {
    localStorage.setItem(`muttjobs.job-view.${job.id}`, JSON.stringify(view))
  }, [job.id, view])
  useEffect(() => {
    if (workspace && content.current)
      content.current.scrollTop = restoredView(job.id).scroll
  }, [!!workspace, job.id])
  useEffect(() => {
    if (!runId) return
    let disposed = false
    let cleanup: (() => void) | undefined
    void listen<{ runId: string; status?: string; event?: { stage?: string } }>(
      "job-workspace-event",
      ({ payload }) => {
        if (payload.runId === runId)
          setRunStatus(payload.status || payload.event?.stage || "Working…")
      },
    )
      .then((fn) => {
        if (disposed) fn()
        else cleanup = fn
      })
      .catch(() => {})
    return () => {
      disposed = true
      cleanup?.()
    }
  }, [runId])
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
    setRunStatus("Starting…")
    try {
      setWorkspace(
        await runWorkspace(
          workspace,
          operation,
          selection,
          id,
          view.selected,
          view.artifact,
          includeResearch,
        ),
      )
      setRunStatus("Saved for review")
    } catch (cause) {
      setError(workspaceError(cause))
      setRunStatus("Previous work retained")
    } finally {
      setBusy(false)
      setRunId("")
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
  const summary = workspace?.summary
  const visibleTargets = targets.filter(
    (t) =>
      view.filter === "All targets" ||
      view.filter === t.priority ||
      view.filter === t.grounding ||
      (view.filter === "Evidence to review" &&
        workspace?.evidence.some(
          (e) => e.suggestion.targetId === t.id && e.review !== "Confirmed",
        )) ||
      (view.filter === "Coverage remaining" &&
        !workspace?.coverage.some(
          (c) =>
            c.placement.targetId === t.id &&
            c.artifact === view.artifact &&
            c.status === "Addressed",
        )),
  )
  const inspector =
    target && workspace ? (
      <div className="target-inspector-content">
        <div className="flex justify-between">
          <Badge variant="outline">{target.priority}</Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={closeInspector}
            aria-label="Close target inspector"
          >
            <X />
          </Button>
        </div>
        <h2>{target.title}</h2>
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
        <small>Examples to look for, not facts about your experience.</small>
        <h3>Career Profile evidence</h3>
        <TargetEvidencePicker
          targetId={target.id}
          disabled={busy}
          onLink={(value) => void change("linkEvidence", value)}
        />
        {workspace.evidence
          .filter((e) => e.suggestion.targetId === target.id)
          .map((e) => (
            <section className="target-evidence" key={e.id}>
              <div className="flex flex-wrap gap-2">
                <Badge>{e.suggestion.strength}</Badge>
                <Badge variant="outline">{e.suggestion.matchKind}</Badge>
                <Badge variant="outline">{e.review}</Badge>
              </div>
              <p>{e.suggestion.explanation}</p>
              {e.suggestion.references.map((r, i) => (
                <blockquote key={i}>
                  {r.excerpt}
                  <small>Career Profile · {r.entryId}</small>
                </blockquote>
              ))}
              <div className="flex gap-2">
                <Button
                  disabled={busy || e.review === "Confirmed"}
                  size="sm"
                  onClick={() =>
                    void change("evidenceReview", {
                      id: e.id,
                      review: "Confirmed",
                    })
                  }
                >
                  Confirm evidence
                </Button>
                <Button
                  disabled={busy}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void change("evidenceReview", {
                      id: e.id,
                      review: "Rejected",
                    })
                  }
                >
                  Reject
                </Button>
              </div>
            </section>
          ))}
        {!workspace.evidence.some(
          (e) => e.suggestion.targetId === target.id,
        ) && (
          <p>
            No assessment yet. Match Career Profile or add factual details to
            your profile.
          </p>
        )}
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
                {["To do", "In progress", "Blocked", "Done", "Dismissed"].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </div>
          ))}
        <p>{workspace.overrides.find((o) => o.targetId === target.id)?.note}</p>
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
      </div>
    ) : null
  return (
    <main className="job-preparation">
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
            <p className="text-sm text-muted-foreground">
              {[job.location, job.salaryString].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Application stage"
              value={job.applicationStatus ?? "revealed"}
              onChange={(e) => void setStage(e.target.value)}
            >
              {applicationStatusMetadata.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSourceOpen(true)}
            >
              <FileText /> Original source
            </Button>
            {(job.finalUrl || job.url || job.sourceUrl) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void openUrl(job.finalUrl || job.url || job.sourceUrl || "")
                }
              >
                Open posting ↗
              </Button>
            )}
          </div>
        </div>
        <div className="preparation-strip" aria-label="Preparation summary">
          <span>{summary?.analysis ?? "Loading…"}</span>
          {summary && (
            <>
              <span>
                <strong>
                  {summary.addressed}/{summary.total}
                </strong>{" "}
                resume targets addressed
              </span>
              <span>
                <strong>{summary.highPriority}</strong> high-priority unresolved
              </span>
              <span>
                <strong>{summary.evidenceToReview}</strong> evidence reviews
              </span>
              <span>
                <strong>{summary.deferred}</strong> deferred / blocked
              </span>
            </>
          )}
        </div>
        <nav aria-label="Job workspace destinations">
          {destinations.map((destination) => (
            <button
              key={destination}
              aria-current={
                view.destination === destination ? "page" : undefined
              }
              onClick={() => {
                updateView({ destination })
                setResume(null)
                setLetter(null)
                void refresh()
              }}
            >
              {destination}
            </button>
          ))}
        </nav>
      </header>
      {error && (
        <div role="alert" className="workspace-error">
          {error}
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            Reload
          </Button>
        </div>
      )}
      <div
        className="job-preparation-body"
        ref={content}
        onScroll={(e) => updateView({ scroll: e.currentTarget.scrollTop })}
      >
        {!workspace ? (
          <p role="status" className="p-8">
            {error ? "Preparation could not be loaded." : "Loading workspace…"}
          </p>
        ) : (
          <>
            <div className="workspace-runbar">
              <ModelReasoningSelector
                value={selection}
                onChange={setSelection}
                disabled={busy}
              />
              <div aria-live="polite">
                {busy && (
                  <LoaderCircle className="inline size-4 animate-spin" />
                )}{" "}
                {runStatus}
              </div>
              {runId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void cancelWorkspaceRun(runId).then(() =>
                      setRunStatus("Cancelling…"),
                    )
                  }
                >
                  Cancel run
                </Button>
              )}
            </div>
            {view.destination === "Targets" && (
              <div className="targets-layout">
                <section className="targets-main">
                  <div className="targets-heading">
                    <div>
                      <p className="job-eyebrow">Application preparation</p>
                      <h2>What this role asks of you</h2>
                      <p className="text-sm text-muted-foreground">
                        {summary?.nextAction}. Reviewed coverage is tied to your
                        selected document.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => editTarget(emptyTarget())}
                    >
                      <Plus /> Add target
                    </Button>
                  </div>
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
                      <p className="source-excerpt">
                        {workspace.source.text ||
                          "Paste the complete posting to begin."}
                      </p>
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
                  <div className="target-toolbar">
                    <select
                      aria-label="Target filter"
                      value={view.filter}
                      onChange={(e) => updateView({ filter: e.target.value })}
                    >
                      {[
                        "All targets",
                        "Must hit",
                        "High",
                        "Medium",
                        "Bonus",
                        "Explicit",
                        "Strong inference",
                        "Weak inference",
                        "Evidence to review",
                        "Coverage remaining",
                      ].map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Selected application artifact"
                      value={view.artifact}
                      onChange={(e) => updateView({ artifact: e.target.value })}
                    >
                      <option value="resume">Primary resume</option>
                      <option value="coverLetter">Cover letter</option>
                    </select>
                    {targets.length > 0 && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || selection.provider !== "codex"}
                          onClick={() => void run("analyze")}
                        >
                          Reanalyze
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void run("match")}
                        >
                          Match Career Profile
                        </Button>
                      </>
                    )}
                    {view.selected.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          editTarget(
                            {
                              ...emptyTarget(),
                              title: "Combined preparation target",
                            },
                            view.selected,
                          )
                        }
                      >
                        Merge selected
                      </Button>
                    )}
                  </div>
                  <div
                    className="target-list"
                    aria-label="Job target checklist"
                  >
                    {visibleTargets.map((t) => {
                      const c = workspace.coverage.find(
                        (c) =>
                          c.placement.targetId === t.id &&
                          c.artifact === view.artifact,
                      )
                      const e = workspace.evidence.find(
                        (e) => e.suggestion.targetId === t.id,
                      )
                      return (
                        <article
                          className={`target-row ${view.targetId === t.id ? "selected" : ""}`}
                          key={t.id}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Select ${t.title} for preparation`}
                            checked={view.selected.includes(t.id)}
                            onChange={(e) =>
                              updateView({
                                selected: e.target.checked
                                  ? [...view.selected, t.id]
                                  : view.selected.filter((id) => id !== t.id),
                              })
                            }
                          />
                          <button
                            className="target-row-open"
                            onClick={(event) => {
                              targetButton.current = event.currentTarget
                              updateView({ targetId: t.id })
                            }}
                          >
                            <span className="target-row-title">
                              {c?.status === "Addressed" ? (
                                <Check aria-label="Reviewed addressed coverage" />
                              ) : (
                                <span
                                  className="coverage-box"
                                  aria-label="Coverage not addressed"
                                />
                              )}
                              <strong>{t.title}</strong>
                            </span>
                            <span className="target-row-meta">
                              {t.priority} · {t.grounding} · {t.category}
                            </span>
                            <span className="target-row-meta">
                              {e?.suggestion.strength ?? "Evidence unreviewed"}{" "}
                              · {c?.status ?? "Coverage unreviewed"}
                            </span>
                          </button>
                        </article>
                      )
                    })}
                  </div>
                  {targets.length > 0 && !visibleTargets.length && (
                    <p className="p-6">No targets match this filter.</p>
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
                {!narrow && target && (
                  <aside
                    className="target-inspector"
                    aria-label="Target inspector"
                  >
                    {inspector}
                  </aside>
                )}
              </div>
            )}
            {view.destination === "Documents" && (
              <section className="workspace-documents">
                <div className="targets-heading">
                  <div>
                    <p className="job-eyebrow">Truthful, targeted materials</p>
                    <h2>Documents</h2>
                    <p>
                      {view.selected.length
                        ? `${view.selected.length} selected targets`
                        : "All active targets"}{" "}
                      · Proposals require review.
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
                    disabled={busy || !targets.length}
                    onClick={() => void run("prepare")}
                  >
                    Prepare targeted proposal
                  </Button>
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
                </div>
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
        open={narrow && !!target}
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
            <DialogTitle>Target inspector</DialogTitle>
            <DialogDescription>
              Review source, evidence and document coverage.
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
                      updateView({ selected: [], targetId: "" })
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
                  />
                ) : (
                  <CoverLetterDocument
                    letter={normalizeAndValidateCoverLetter(proposal.data)}
                  />
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={busy || proposal.status !== "Unreviewed"}
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
                  Accept document
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
                  Reject proposal
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
