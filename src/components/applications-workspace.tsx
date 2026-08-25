import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  CircleX,
  Columns3,
  FilePenLine,
  Inbox,
  LoaderCircle,
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react"
import { format } from "date-fns"

import { JobWorkspace } from "@/components/job-workspace"
import {
  AgentActivityTrace,
  DEFAULT_RESUME_AI_SELECTION,
  ModelReasoningSelector,
  type AgentActivity,
} from "@/components/resume-ai-sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ALL_AGENT_MODELS } from "@/lib/agent-models"
import { runCoverLetterAiJob } from "@/lib/cover-letter-ai"
import {
  hasDraftedJobCoverLetter,
  loadOrCreateJobCoverLetter,
} from "@/lib/cover-letter-storage"
import {
  createCompanyResearchRequest,
  listCompanyResearchRuns,
  startCompanyResearchRun,
  type CompanyResearchRun,
} from "@/lib/company-research"
import { loadJobPrimaryResume } from "@/lib/resume-storage"
import {
  createPrimaryResumeGenerationRunId,
  generatePrimaryResumeFromProfile,
} from "@/lib/profile-resume-generation"
import {
  listJobImportJobs,
  startJobUrlImport,
  subscribeToJobImportEvents,
  type JobImportJob,
} from "@/lib/job-import"
import { Skeleton } from "@/components/ui/skeleton"
import {
  applicationStatusMetadata,
  defaultApplicationStatus,
  listSavedTheirStackJobs,
  normalizeApplicationStatus,
  updateTheirStackJobStatus,
  type ApplicationStatus,
  type TheirStackJob,
} from "@/lib/theirstack"
import { cn } from "@/lib/utils"

const statusDotClasses: Record<ApplicationStatus, string> = {
  revealed: "bg-muted-foreground",
  in_process: "bg-status-warning",
  applied: "bg-primary",
  interviewing: "bg-status-success",
  offer: "bg-status-success",
  denied: "bg-destructive",
  not_interested: "bg-muted-foreground",
}

type BulkResearchStatus = "queued" | "running" | "completed" | "failed"

type BulkResearchJobState = {
  status: BulkResearchStatus
  error?: string
}

const BULK_RESEARCH_CONCURRENCY = 2

const AUTO_CREATE_COVER_LETTER_PROMPT = `Write a complete, polished cover letter for this exact role using the job's primary resume and the target job details supplied with this request.

The job primary resume is the authoritative source for every candidate claim. Use the job description and Company Research to choose emphasis, vocabulary, and motivation, but never treat them as evidence that the candidate has a skill, responsibility, result, credential, or experience. Do not invent or infer candidate facts, metrics, hiring-manager details, addresses, or company facts.

Replace the document's draft prose with a concise, role-specific letter:
- Write a direct opening that names the role and establishes the strongest supported fit.
- Use the body to connect the most relevant resume evidence to the job's actual priorities. Prefer specific supported examples over generic enthusiasm or a resume recap.
- End with a confident, natural closing paragraph and call to action.
- Keep the letter skimmable and approximately 250-400 words across the existing opening, body, and closingParagraph fields. Keep body within the schema's 1-4 paragraph limit.
- Avoid placeholders, clichés, keyword stuffing, unsupported superlatives, and claims about company culture that are not supported by the supplied context.
- Preserve the existing JSON contract, applicant contact details, recipient details, position metadata, typography, page settings, sign-off, and all other presentation fields unless a supplied job or resume value directly fills a blank identity field.

Before saving, verify that every candidate claim is supported by the primary resume, the company and role are correct, the prose sounds human and specific, and the JSON remains a valid editable cover letter.`

export function ApplicationsWorkspace({
  onDocumentViewerChange,
}: {
  onDocumentViewerChange?: (open: boolean) => void
}) {
  const [jobs, setJobs] = useState<TheirStackJob[]>([])
  const [selectedJob, setSelectedJob] = useState<TheirStackJob | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [jobImports, setJobImports] = useState<JobImportJob[]>([])
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importUrl, setImportUrl] = useState("")
  const [importSelection, setImportSelection] = useState(DEFAULT_RESUME_AI_SELECTION)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState("")
  const [selectedResearchJobIds, setSelectedResearchJobIds] = useState<Set<number>>(
    () => new Set(),
  )
  const [researchSelection, setResearchSelection] = useState(DEFAULT_RESUME_AI_SELECTION)
  const [bulkResearchByJobId, setBulkResearchByJobId] = useState<
    Record<number, BulkResearchJobState>
  >({})
  const [isBulkResearching, setIsBulkResearching] = useState(false)
  const [bulkResearchMessage, setBulkResearchMessage] = useState("")
  const [successfulResearchByJobId, setSuccessfulResearchByJobId] = useState<
    Record<number, boolean>
  >({})
  const [bulkCreationByJobId, setBulkCreationByJobId] = useState<
    Record<number, BulkResearchJobState>
  >({})
  const [isBulkCreating, setIsBulkCreating] = useState(false)
  const [bulkCreationMessage, setBulkCreationMessage] = useState("")
  const [bulkCoverLetterByJobId, setBulkCoverLetterByJobId] = useState<
    Record<number, BulkResearchJobState>
  >({})
  const [draftedCoverLetterByJobId, setDraftedCoverLetterByJobId] = useState<
    Record<number, boolean>
  >({})
  const [isBulkCoverLetterCreating, setIsBulkCoverLetterCreating] = useState(false)
  const [bulkCoverLetterMessage, setBulkCoverLetterMessage] = useState("")
  const [draggedJobId, setDraggedJobId] = useState<number | null>(null)
  const [dropTargetStatus, setDropTargetStatus] = useState<ApplicationStatus | null>(null)
  const [savingJobId, setSavingJobId] = useState<number | null>(null)
  const pointerDragRef = useRef<{
    jobId: number
    pointerId: number
    startX: number
    startY: number
    active: boolean
  } | null>(null)

  const loadSavedJobs = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true)
    setError(null)
    try {
      const [savedJobs, imports] = await Promise.all([
        listSavedTheirStackJobs(),
        listJobImportJobs(),
      ])
      const researchResults = await Promise.all(savedJobs.map(async (job) => {
        try {
          const runs = await listCompanyResearchRuns(job.id)
          return [job.id, runs.some(isSuccessfulCompanyResearchRun)] as const
        } catch {
          return [job.id, false] as const
        }
      }))
      const coverLetterResults = await Promise.all(savedJobs.map(async (job) => (
        [job.id, await hasDraftedJobCoverLetter(job.id)] as const
      )))
      setJobs(savedJobs)
      setSuccessfulResearchByJobId(Object.fromEntries(researchResults))
      setDraftedCoverLetterByJobId(Object.fromEntries(coverLetterResults))
      const savedJobIds = new Set(savedJobs.map((job) => job.id))
      setSelectedResearchJobIds((current) =>
        new Set([...current].filter((jobId) => savedJobIds.has(jobId))),
      )
      setJobImports(imports.filter((job) => job.status !== "completed"))
    } catch (cause) {
      setError(errorMessage(cause, "Saved jobs could not be loaded."))
    } finally {
      if (showLoading) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSavedJobs()
  }, [loadSavedJobs])

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined

    void subscribeToJobImportEvents((job) => {
      if (disposed) return
      if (job.status === "completed") {
        setJobImports((current) => current.filter((existing) => existing.jobId !== job.jobId))
        void loadSavedJobs(false)
        return
      }
      setJobImports((current) => upsertJobImport(current, job))
    }).then((unlisten) => {
      if (disposed) unlisten()
      else cleanup = unlisten
    }).catch(() => {
      // The browser preview has no Tauri event bridge.
    })

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [loadSavedJobs])

  function openImportDialog() {
    setImportUrl("")
    setImportError("")
    setImportDialogOpen(true)
  }

  async function submitJobImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isImporting) return

    const url = importUrl.trim()
    if (!url) {
      setImportError("Enter a job posting URL first.")
      return
    }
    try {
      const parsed = new URL(url)
      if (!matchesHttpUrl(parsed)) throw new Error("Enter a valid http or https job posting URL.")
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : "Enter a valid job posting URL.")
      return
    }

    setIsImporting(true)
    setImportError("")
    try {
      const job = await startJobUrlImport(url, importSelection)
      setJobImports((current) => upsertJobImport(current, job))
      setImportDialogOpen(false)
      setImportUrl("")
      void loadSavedJobs(false)
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : "The job import could not be started.")
    } finally {
      setIsImporting(false)
    }
  }

  const clearDragState = useCallback(() => {
    pointerDragRef.current = null
    setDraggedJobId(null)
    setDropTargetStatus(null)
  }, [])

  const saveJobStatus = useCallback(
    async (jobId: number, status: ApplicationStatus) => {
      const job = jobs.find((candidate) => candidate.id === jobId)
      const previousStatus = job ? normalizeApplicationStatus(job.applicationStatus) : null

      if (!job || previousStatus === null || previousStatus === status) return

      setJobs((currentJobs) =>
        currentJobs.map((currentJob) =>
          currentJob.id === job.id ? { ...currentJob, applicationStatus: status } : currentJob,
        ),
      )
      setSavingJobId(job.id)

      try {
        await updateTheirStackJobStatus(job.id, status)
      } catch (cause) {
        setJobs((currentJobs) =>
          currentJobs.map((currentJob) =>
            currentJob.id === job.id
              ? { ...currentJob, applicationStatus: previousStatus }
              : currentJob,
          ),
        )
        setError(errorMessage(cause, "The job status could not be saved."))
      } finally {
        setSavingJobId((currentJobId) => (currentJobId === job.id ? null : currentJobId))
      }
    },
    [jobs],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, job: TheirStackJob) => {
      if (event.button !== 0 || savingJobId !== null) return

      event.preventDefault()
      pointerDragRef.current = {
        jobId: job.id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Window listeners still receive the gesture in embedded WebViews without capture.
      }
    },
    [savingJobId],
  )

  useEffect(() => {
    function updateDropTarget(clientX: number, clientY: number) {
      const element = document
        .elementFromPoint(clientX, clientY)
        ?.closest<HTMLElement>("[data-application-status]")
      const status = element?.dataset.applicationStatus as ApplicationStatus | undefined

      setDropTargetStatus(status ?? null)
      return status ?? null
    }

    function handlePointerMove(event: PointerEvent) {
      const drag = pointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      if (!drag.active) {
        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
        if (distance < 5) return
        drag.active = true
        setDraggedJobId(drag.jobId)
      }

      event.preventDefault()
      updateDropTarget(event.clientX, event.clientY)
    }

    function handlePointerUp(event: PointerEvent) {
      const drag = pointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      const status = drag.active ? updateDropTarget(event.clientX, event.clientY) : null
      clearDragState()
      if (drag.active && status) void saveJobStatus(drag.jobId, status)
    }

    function handlePointerCancel(event: PointerEvent) {
      const drag = pointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      clearDragState()
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false })
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
    }
  }, [clearDragState, saveJobStatus])

  const jobsByStatus = useMemo(() => {
    const grouped = Object.fromEntries(
      applicationStatusMetadata.map((status) => [status.value, [] as TheirStackJob[]]),
    ) as Record<ApplicationStatus, TheirStackJob[]>

    for (const job of jobs) {
      const status = job.applicationStatus ?? defaultApplicationStatus
      grouped[status].push(job)
    }

    return grouped
  }, [jobs])

  const selectedResearchJobs = useMemo(
    () => jobs.filter((job) => selectedResearchJobIds.has(job.id)),
    [jobs, selectedResearchJobIds],
  )
  const completedBulkResearchCount = Object.values(bulkResearchByJobId).filter(
    (state) => state.status === "completed" || state.status === "failed",
  ).length
  const completedBulkCreationCount = Object.values(bulkCreationByJobId).filter(
    (state) => state.status === "completed" || state.status === "failed",
  ).length
  const completedBulkCoverLetterCount = Object.values(bulkCoverLetterByJobId).filter(
    (state) => state.status === "completed" || state.status === "failed",
  ).length
  const isBulkActionRunning = isBulkResearching
    || isBulkCreating
    || isBulkCoverLetterCreating

  function setJobResearchSelected(jobId: number, selected: boolean) {
    setSelectedResearchJobIds((current) => {
      const next = new Set(current)
      if (selected) next.add(jobId)
      else next.delete(jobId)
      return next
    })
  }

  async function runBulkCompanyResearch() {
    if (isBulkActionRunning || selectedResearchJobs.length === 0) return

    const jobsWithCompany = selectedResearchJobs.filter((job) => job.company?.trim())
    const initialState = Object.fromEntries(selectedResearchJobs.map((job) => [
      job.id,
      job.company?.trim()
        ? { status: "queued" as const }
        : { status: "failed" as const, error: "Company name is missing." },
    ]))
    setBulkResearchByJobId(initialState)
    setBulkResearchMessage("")
    setIsBulkResearching(true)

    let nextIndex = 0
    let completedCount = 0
    let failedCount = selectedResearchJobs.length - jobsWithCompany.length

    async function researchNextJob() {
      while (nextIndex < jobsWithCompany.length) {
        const job = jobsWithCompany[nextIndex]
        nextIndex += 1
        setBulkResearchByJobId((current) => ({
          ...current,
          [job.id]: { status: "running" },
        }))
        try {
          const run = await startCompanyResearchRun(
            createCompanyResearchRequest(job, researchSelection),
            () => undefined,
          )
          if (!isSuccessfulCompanyResearchRun(run)) {
            throw new Error("Company research finished without a usable company ledger.")
          }
          completedCount += 1
          setSuccessfulResearchByJobId((current) => ({
            ...current,
            [job.id]: true,
          }))
          setBulkResearchByJobId((current) => ({
            ...current,
            [job.id]: { status: "completed" },
          }))
        } catch (cause) {
          failedCount += 1
          setBulkResearchByJobId((current) => ({
            ...current,
            [job.id]: {
              status: "failed",
              error: errorMessage(cause, "Company research failed."),
            },
          }))
        }
      }
    }

    const workerCount = Math.min(BULK_RESEARCH_CONCURRENCY, jobsWithCompany.length)
    await Promise.all(Array.from({ length: workerCount }, researchNextJob))
    setIsBulkResearching(false)
    setBulkResearchMessage(
      failedCount === 0
        ? `Company research finished for ${completedCount} ${completedCount === 1 ? "job" : "jobs"}.`
        : `Company research finished for ${completedCount} ${completedCount === 1 ? "job" : "jobs"}; ${failedCount} failed.`,
    )
  }

  async function runBulkResumeCreation() {
    if (isBulkActionRunning || selectedResearchJobs.length === 0) return

    const replacingCount = selectedResearchJobs.filter((job) => job.primaryResume).length
    if (replacingCount > 0 && !window.confirm(
      `${replacingCount} selected ${replacingCount === 1 ? "job already has a primary resume" : "jobs already have primary resumes"}. Successful generation will replace ${replacingCount === 1 ? "it" : "them"} with resumes built from the latest Career Profile. Continue?`,
    )) return

    const initialState = Object.fromEntries(selectedResearchJobs.map((job) => [
      job.id,
      { status: "queued" as const },
    ]))
    setBulkCreationByJobId(initialState)
    setBulkCreationMessage("")
    setIsBulkCreating(true)

    let nextIndex = 0
    let completedCount = 0
    let failedCount = 0

    async function createNextResume() {
      while (nextIndex < selectedResearchJobs.length) {
        const job = selectedResearchJobs[nextIndex]
        nextIndex += 1
        setBulkCreationByJobId((current) => ({
          ...current,
          [job.id]: { status: "running" },
        }))
        try {
          const result = await generatePrimaryResumeFromProfile({
            runId: createPrimaryResumeGenerationRunId(),
            jobId: job.id,
            provider: researchSelection.provider,
            model: researchSelection.model,
            effort: researchSelection.effort,
          })
          setJobs((currentJobs) => currentJobs.map((currentJob) =>
            currentJob.id === job.id
              ? { ...currentJob, primaryResume: result.primaryResume }
              : currentJob,
          ))

          completedCount += 1
          setBulkCreationByJobId((current) => ({
            ...current,
            [job.id]: { status: "completed" },
          }))
        } catch (cause) {
          failedCount += 1
          setBulkCreationByJobId((current) => ({
            ...current,
            [job.id]: {
              status: "failed",
              error: errorMessage(cause, "Resume creation failed. Complete your Career Profile and try again."),
            },
          }))
        }
      }
    }

    const workerCount = Math.min(BULK_RESEARCH_CONCURRENCY, selectedResearchJobs.length)
    await Promise.all(Array.from({ length: workerCount }, createNextResume))
    setIsBulkCreating(false)
    setBulkCreationMessage(
      failedCount === 0
        ? `Tailored resumes finished for ${completedCount} ${completedCount === 1 ? "job" : "jobs"}.`
        : `Tailored resumes finished for ${completedCount} ${completedCount === 1 ? "job" : "jobs"}; ${failedCount} failed.`,
    )
  }

  async function runBulkCoverLetterCreation() {
    if (isBulkActionRunning || selectedResearchJobs.length === 0) return

    const initialState = Object.fromEntries(selectedResearchJobs.map((job) => [
      job.id,
      job.primaryResume
        ? { status: "queued" as const }
        : { status: "failed" as const, error: "Create this job's primary resume first." },
    ]))
    const jobsWithPrimaryResumes = selectedResearchJobs.filter((job) => job.primaryResume)
    setBulkCoverLetterByJobId(initialState)
    setBulkCoverLetterMessage("")
    setIsBulkCoverLetterCreating(true)

    let nextIndex = 0
    let completedCount = 0
    let failedCount = selectedResearchJobs.length - jobsWithPrimaryResumes.length

    async function createNextCoverLetter() {
      while (nextIndex < jobsWithPrimaryResumes.length) {
        const job = jobsWithPrimaryResumes[nextIndex]
        nextIndex += 1
        setBulkCoverLetterByJobId((current) => ({
          ...current,
          [job.id]: { status: "running" },
        }))
        try {
          await loadJobPrimaryResume(job.id, job.primaryResume!.sourceFileName)
          const coverLetter = await loadOrCreateJobCoverLetter(job)
          await runCoverLetterAiJob(
            coverLetter.path,
            AUTO_CREATE_COVER_LETTER_PROMPT,
            researchSelection,
            { targetJobId: job.id },
          )
          completedCount += 1
          setDraftedCoverLetterByJobId((current) => ({ ...current, [job.id]: true }))
          setBulkCoverLetterByJobId((current) => ({
            ...current,
            [job.id]: { status: "completed" },
          }))
        } catch (cause) {
          failedCount += 1
          setBulkCoverLetterByJobId((current) => ({
            ...current,
            [job.id]: {
              status: "failed",
              error: errorMessage(cause, "Cover letter creation failed."),
            },
          }))
        }
      }
    }

    const workerCount = Math.min(BULK_RESEARCH_CONCURRENCY, jobsWithPrimaryResumes.length)
    await Promise.all(Array.from({ length: workerCount }, createNextCoverLetter))
    setIsBulkCoverLetterCreating(false)
    setBulkCoverLetterMessage(
      failedCount === 0
        ? `Cover letters finished for ${completedCount} ${completedCount === 1 ? "job" : "jobs"}.`
        : `Cover letters finished for ${completedCount} ${completedCount === 1 ? "job" : "jobs"}; ${failedCount} failed.`,
    )
  }

  if (selectedJob) {
    return (
      <JobWorkspace
        job={selectedJob}
        onBack={() => setSelectedJob(null)}
        onDocumentViewerChange={onDocumentViewerChange}
        onJobChange={(nextJob) => {
          setSelectedJob(nextJob)
          setJobs((currentJobs) => currentJobs.map((job) => job.id === nextJob.id ? nextJob : job))
        }}
      />
    )
  }

  return (
    <main className="flex min-h-svh flex-1 flex-col overflow-hidden bg-muted/20">
      <header className="border-b bg-background px-5 py-5 md:px-8 md:py-7">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="secondary" className="font-normal">
                <Columns3 data-icon="inline-start" /> Application pipeline
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Keep your search moving
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
              Every revealed role lives here, organized by the next step in your
              application journey.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-lg border bg-background px-3 py-2 text-right">
              <p className="text-lg font-semibold leading-none tabular-nums">{jobs.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {jobs.length === 1 ? "saved role" : "saved roles"}
              </p>
            </div>
            <Button variant="default" size="sm" onClick={openImportDialog}>
              <Plus />
              Import job
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadSavedJobs()}
              disabled={isLoading}
            >
              {isLoading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex w-max min-w-full max-w-[1800px] flex-col gap-5 px-5 py-5 md:px-8 md:py-7">
          {error ? (
            <div
              role="alert"
              className="w-full rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          {!isLoading && jobs.length ? (
            <Card className="company-research-controls w-full gap-0 overflow-visible py-0">
              <CardContent className="flex flex-col items-start gap-4 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Search className="size-4 text-primary" />
                    Bulk job automation
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground" aria-live="polite">
                    {isBulkResearching
                      ? `Researching selected jobs (${completedBulkResearchCount}/${selectedResearchJobs.length} finished).`
                      : isBulkCreating
                        ? `Creating Profile-based resumes for selected jobs (${completedBulkCreationCount}/${selectedResearchJobs.length} finished).`
                          : isBulkCoverLetterCreating
                            ? `Creating cover letters for selected jobs (${completedBulkCoverLetterCount}/${selectedResearchJobs.length} finished).`
                            : bulkCoverLetterMessage || bulkCreationMessage || bulkResearchMessage || `${selectedResearchJobs.length} ${selectedResearchJobs.length === 1 ? "job" : "jobs"} selected.`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-start gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedResearchJobIds(new Set(jobs.map((job) => job.id)))}
                    disabled={isBulkActionRunning || selectedResearchJobIds.size === jobs.length}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedResearchJobIds(new Set())}
                    disabled={isBulkActionRunning || selectedResearchJobIds.size === 0}
                  >
                    Clear
                  </Button>
                  <ModelReasoningSelector
                    value={researchSelection}
                    onChange={setResearchSelection}
                    disabled={isBulkActionRunning}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void runBulkCompanyResearch()}
                    disabled={isBulkActionRunning || selectedResearchJobs.length === 0}
                  >
                    {isBulkResearching ? <LoaderCircle className="animate-spin" /> : <Search />}
                    {isBulkResearching ? "Researching companies..." : "Company research"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void runBulkResumeCreation()}
                    disabled={isBulkActionRunning || selectedResearchJobs.length === 0}
                  >
                    {isBulkCreating ? <LoaderCircle className="animate-spin" /> : <FilePenLine />}
                    {isBulkCreating ? "Creating resumes..." : "Auto create resume"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void runBulkCoverLetterCreation()}
                    disabled={isBulkActionRunning || selectedResearchJobs.length === 0}
                  >
                    {isBulkCoverLetterCreating ? <LoaderCircle className="animate-spin" /> : <Mail />}
                    {isBulkCoverLetterCreating ? "Creating cover letters..." : "Auto create cover letter"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {jobImports.length ? (
            <div className="grid w-full gap-3 lg:grid-cols-2" aria-label="Job imports">
              {jobImports.map((job) => (
                <JobImportActivityCard key={job.jobId} job={job} />
              ))}
            </div>
          ) : null}

          {isLoading ? (
            <ApplicationsBoardSkeleton />
          ) : (
            <div className="grid auto-cols-[minmax(18rem,21rem)] grid-flow-col gap-4">
              {applicationStatusMetadata.map((status) => (
                <ApplicationColumn
                  key={status.value}
                  status={status.value}
                  label={status.label}
                  description={status.description}
                  jobs={jobsByStatus[status.value]}
                  onViewJob={setSelectedJob}
                  draggedJobId={draggedJobId}
                  dropTargetStatus={dropTargetStatus}
                  savingJobId={savingJobId}
                  onPointerDown={handlePointerDown}
                  selectedResearchJobIds={selectedResearchJobIds}
                  bulkResearchByJobId={bulkResearchByJobId}
                  bulkCreationByJobId={bulkCreationByJobId}
                  bulkCoverLetterByJobId={bulkCoverLetterByJobId}
                  draftedCoverLetterByJobId={draftedCoverLetterByJobId}
                  successfulResearchByJobId={successfulResearchByJobId}
                  researchSelectionDisabled={isBulkActionRunning}
                  onResearchSelectionChange={setJobResearchSelected}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-xl">
          <form className="grid min-w-0 gap-5" onSubmit={submitJobImport}>
            <DialogHeader>
              <DialogTitle>Import a job</DialogTitle>
              <DialogDescription>
                Paste a job posting URL and MuttJobs will extract it in the background.
              </DialogDescription>
            </DialogHeader>

            <div className="grid min-w-0 gap-2">
              <Label htmlFor="job-import-url">Job posting URL</Label>
              <Input
                id="job-import-url"
                type="url"
                value={importUrl}
                onChange={(event) => {
                  setImportUrl(event.target.value)
                  setImportError("")
                }}
                placeholder="https://careers.example.com/jobs/..."
                autoFocus
                disabled={isImporting}
              />
            </div>

            <div className="resume-import-selector job-import-selector grid min-w-0 gap-2">
              <div>
                <Label>Import agent</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Choose the model and reasoning depth for this extraction.
                </p>
              </div>
              <ModelReasoningSelector
                value={importSelection}
                onChange={setImportSelection}
                disabled={isImporting}
              />
            </div>

            {importError ? (
              <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{importError}</span>
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setImportDialogOpen(false)}
                disabled={isImporting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isImporting || !importUrl.trim()}>
                {isImporting ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                {isImporting ? "Starting import..." : "Start import"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function ApplicationColumn({
  status,
  label,
  description,
  jobs,
  onViewJob,
  draggedJobId,
  dropTargetStatus,
  savingJobId,
  onPointerDown,
  selectedResearchJobIds,
  bulkResearchByJobId,
  bulkCreationByJobId,
  bulkCoverLetterByJobId,
  draftedCoverLetterByJobId,
  successfulResearchByJobId,
  researchSelectionDisabled,
  onResearchSelectionChange,
}: {
  status: ApplicationStatus
  label: string
  description: string
  jobs: TheirStackJob[]
  onViewJob: (job: TheirStackJob) => void
  draggedJobId: number | null
  dropTargetStatus: ApplicationStatus | null
  savingJobId: number | null
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, job: TheirStackJob) => void
  selectedResearchJobIds: Set<number>
  bulkResearchByJobId: Record<number, BulkResearchJobState>
  bulkCreationByJobId: Record<number, BulkResearchJobState>
  bulkCoverLetterByJobId: Record<number, BulkResearchJobState>
  draftedCoverLetterByJobId: Record<number, boolean>
  successfulResearchByJobId: Record<number, boolean>
  researchSelectionDisabled: boolean
  onResearchSelectionChange: (jobId: number, selected: boolean) => void
}) {
  return (
    <Card
      className={cn(
        "flex min-h-[32rem] flex-col gap-0 overflow-hidden py-0 transition-shadow",
        dropTargetStatus === status && "ring-2 ring-primary/50",
      )}
      data-application-status={status}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className={cn("size-2 rounded-full", statusDotClasses[status])} />
            {label}
          </CardTitle>
          <CardDescription className="mt-1 line-clamp-2 text-xs leading-5">
            {description}
          </CardDescription>
        </div>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {jobs.length}
        </Badge>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto p-3">
        {jobs.length ? (
          <div className="space-y-3">
            {jobs.map((job) => (
              <ApplicationJobCard
                key={job.id}
                job={job}
                onViewJob={onViewJob}
                isDragging={draggedJobId === job.id}
                isSaving={savingJobId !== null}
                onPointerDown={onPointerDown}
                isSelectedForResearch={selectedResearchJobIds.has(job.id)}
                researchState={bulkResearchByJobId[job.id]}
                creationState={bulkCreationByJobId[job.id]}
                coverLetterState={bulkCoverLetterByJobId[job.id]}
                hasDraftedCoverLetter={draftedCoverLetterByJobId[job.id] === true}
                hasSuccessfulResearch={successfulResearchByJobId[job.id] === true}
                researchSelectionDisabled={researchSelectionDisabled}
                onResearchSelectionChange={onResearchSelectionChange}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
            <Inbox className="size-6 text-muted-foreground/70" />
            <p className="mt-3 text-sm font-medium">Nothing here yet</p>
            <p className="mt-1 max-w-52 text-xs leading-5 text-muted-foreground">
              Jobs moved here will appear in this stage.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function JobImportActivityCard({ job }: { job: JobImportJob }) {
  const isRunning = job.status === "queued" || job.status === "running"
  const activities = jobImportActivities(job)
  const statusLabel = job.status === "failed"
    ? "Import failed"
    : isRunning
      ? "Importing job"
      : "Imported"

  return (
    <Card className={cn("overflow-hidden py-0", job.status === "failed" && "border-destructive/30")}>
      <CardHeader className="border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
            {job.status === "failed" ? (
              <CircleX className="size-4 shrink-0 text-destructive" />
            ) : isRunning ? (
              <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" />
            ) : (
              <CircleCheck className="size-4 shrink-0 text-status-success" />
            )}
            <span className="truncate">{statusLabel}</span>
          </CardTitle>
          <Badge variant="secondary" className="shrink-0">
            Background
          </Badge>
        </div>
        <CardDescription className="truncate text-xs" title={job.url}>
          {job.url}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3 rounded-lg bg-muted/35 px-3 py-2.5">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{job.stage}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {jobImportModelLabel(job)} · {formatJobImportEffort(job.effort)} reasoning
            </p>
          </div>
        </div>
        {activities.length ? (
          <AgentActivityTrace activities={activities} isStreaming={isRunning} />
        ) : (
          <p className="text-xs text-muted-foreground">
            {isRunning ? "Preparing the import activity…" : "No activity was recorded."}
          </p>
        )}
        {job.error ? (
          <p className="flex items-start gap-2 text-xs text-destructive" role="alert">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{job.error}</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ApplicationJobCard({
  job,
  onViewJob,
  isDragging,
  isSaving,
  onPointerDown,
  isSelectedForResearch,
  researchState,
  creationState,
  coverLetterState,
  hasDraftedCoverLetter,
  hasSuccessfulResearch,
  researchSelectionDisabled,
  onResearchSelectionChange,
}: {
  job: TheirStackJob
  onViewJob: (job: TheirStackJob) => void
  isDragging: boolean
  isSaving: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, job: TheirStackJob) => void
  isSelectedForResearch: boolean
  researchState?: BulkResearchJobState
  creationState?: BulkResearchJobState
  coverLetterState?: BulkResearchJobState
  hasDraftedCoverLetter: boolean
  hasSuccessfulResearch: boolean
  researchSelectionDisabled: boolean
  onResearchSelectionChange: (jobId: number, selected: boolean) => void
}) {
  const location = jobLocation(job)
  const salary = jobSalary(job)

  return (
    <article
      className={cn(
        "relative rounded-lg border bg-background p-3 transition-[opacity,box-shadow] hover:shadow-md",
        isDragging && "opacity-50",
        isSelectedForResearch && "border-primary/50 ring-2 ring-primary/20",
      )}
    >
      <button
        type="button"
        aria-label={`Drag ${job.jobTitle} to change its application status`}
        title="Drag to move this job"
        className="kanban-card-drag-handle"
        onPointerDown={(event) => onPointerDown(event, job)}
        disabled={isSaving}
      />
      <div className="flex min-w-0 items-start gap-3">
        <Checkbox
          className="mt-1"
          checked={isSelectedForResearch}
          onCheckedChange={(checked) => onResearchSelectionChange(job.id, checked === true)}
          disabled={researchSelectionDisabled}
          aria-label={`Select ${job.jobTitle} at ${job.company || "this company"} for bulk actions`}
        />
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-sm font-semibold text-muted-foreground">
          {job.companyObject?.logo ? (
            <img src={job.companyObject.logo} alt="" className="size-full object-contain p-1" />
          ) : (
            (job.company || job.jobTitle).trim().charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-5" title={job.jobTitle}>
            {job.jobTitle}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <Building2 className="size-3.5 shrink-0" />
            <span className="truncate">{job.company || "Company not provided"}</span>
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
        {location ? (
          <p className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            <span className="line-clamp-2">{location}</span>
          </p>
        ) : null}
        {salary ? <p className="truncate pl-5">{salary}</p> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <JobStepBadge
          satisfied={hasSuccessfulResearch || researchState?.status === "completed"}
          failed={researchState?.status === "failed"}
          label="Company research"
          pendingLabel={researchState?.status === "running"
            ? "Researching"
            : researchState?.status === "queued"
              ? "Research queued"
              : undefined}
          error={researchState?.error}
        />
        <JobStepBadge
          satisfied={creationState
            ? creationState.status === "completed"
            : Boolean(job.primaryResume)}
          failed={creationState?.status === "failed"}
          label="Resume created"
          pendingLabel={creationState?.status === "running"
            ? "Creating resume"
            : creationState?.status === "queued"
              ? "Creation queued"
              : undefined}
          error={creationState?.error}
        />
        <JobStepBadge
          satisfied={hasDraftedCoverLetter || coverLetterState?.status === "completed"}
          failed={coverLetterState?.status === "failed"}
          label="Cover letter created"
          pendingLabel={coverLetterState?.status === "running"
            ? "Creating cover letter"
            : coverLetterState?.status === "queued"
              ? "Cover letter queued"
              : undefined}
          error={coverLetterState?.error}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" />
            {formatJobDate(job.datePosted)}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={() => onViewJob(job)}
        >
          View job
          <ArrowRight />
        </Button>
      </div>
    </article>
  )
}

function JobStepBadge({
  satisfied,
  failed,
  label,
  pendingLabel,
  error,
}: {
  satisfied: boolean
  failed: boolean
  label: string
  pendingLabel?: string
  error?: string
}) {
  const isPending = Boolean(pendingLabel)
  const isUnsatisfiedFailure = failed && !satisfied
  const displayLabel = isUnsatisfiedFailure
    ? `${label} failed`
    : pendingLabel ?? (satisfied ? label : `${label} needed`)

  return (
    <Badge
      variant={satisfied ? "default" : "destructive"}
      className="h-5 px-1.5 text-[10px]"
      title={isUnsatisfiedFailure && error
        ? error
        : satisfied
          ? `${label} is complete.`
          : `${label} has not been completed successfully.`}
    >
      {isPending ? (
        <LoaderCircle className="animate-spin" />
      ) : satisfied ? (
        <CircleCheck />
      ) : (
        <CircleX />
      )}
      {displayLabel}
    </Badge>
  )
}

function isSuccessfulCompanyResearchRun(run: CompanyResearchRun) {
  return (
    (run.status === "completed" || run.status === "completed_with_gaps")
    && Boolean(run.ledger)
  )
}

function ApplicationsBoardSkeleton() {
  return (
    <div className="grid auto-cols-[minmax(18rem,21rem)] grid-flow-col gap-4">
      {Array.from({ length: applicationStatusMetadata.length }, (_, index) => (
        <Card key={index} className="flex min-h-[32rem] flex-col gap-0 overflow-hidden py-0">
          <CardHeader className="space-y-2 border-b px-4 py-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-44" />
          </CardHeader>
          <CardContent className="space-y-3 p-3">
            {Array.from({ length: index === 0 ? 3 : 1 }, (_, cardIndex) => (
              <div key={cardIndex} className="space-y-3 rounded-lg border p-3">
                <div className="flex gap-3">
                  <Skeleton className="size-10 shrink-0 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-7 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function jobLocation(job: TheirStackJob) {
  return (
    job.locations
      .map((location) => location.displayName || location.name)
      .filter(Boolean)
      .join(", ") ||
    job.longLocation ||
    job.shortLocation ||
    job.location ||
    job.country ||
    null
  )
}

function jobSalary(job: TheirStackJob) {
  if (job.salaryString) return job.salaryString
  if (job.minAnnualSalaryUsd != null && job.maxAnnualSalaryUsd != null) {
    return `${formatUsd(job.minAnnualSalaryUsd)} – ${formatUsd(job.maxAnnualSalaryUsd)}`
  }
  if (job.avgAnnualSalaryUsd != null) return `${formatUsd(job.avgAnnualSalaryUsd)} average`
  return null
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatJobDate(value?: string | null) {
  if (!value) return "Date not provided"
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : format(date, "MMM d, yyyy")
}

function upsertJobImport(current: JobImportJob[], next: JobImportJob) {
  const existingIndex = current.findIndex((job) => job.jobId === next.jobId)
  if (existingIndex === -1) return [next, ...current]
  if (current[existingIndex].updatedAt > next.updatedAt) return current
  return current.map((job, index) => (index === existingIndex ? next : job))
}

function jobImportActivities(job: JobImportJob): AgentActivity[] {
  return job.activities.flatMap((event) => event.type === "item"
    ? [{
        id: event.id,
        kind: event.kind,
        status: event.status,
        eventType: event.eventType,
        item: event.item,
      }]
    : [])
}

function jobImportModelLabel(job: JobImportJob) {
  return ALL_AGENT_MODELS.find((model) => model.providerId === job.provider && model.id === job.model)?.name
    ?? job.model
    ?? (job.provider === "claude-code" ? "Claude Code" : "Codex")
}

function formatJobImportEffort(value: string | null) {
  if (!value || value === "auto") return "Default"
  if (value === "extra-high" || value === "xhigh") return "Extra High"
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function matchesHttpUrl(value: URL) {
  return (value.protocol === "http:" || value.protocol === "https:") && Boolean(value.hostname)
}

function errorMessage(cause: unknown, fallback: string) {
  if (typeof cause === "string") return cause
  if (cause instanceof Error && cause.message) {
    if (/invoke|tauri/i.test(cause.message)) {
      return "Saved jobs can be loaded from the MuttJobs desktop app."
    }
    return cause.message
  }
  return fallback
}
