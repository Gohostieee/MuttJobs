import { useEffect, useMemo, useState } from "react"
import {
  Check,
  FileJson2,
  Grid2X2,
  LoaderCircle,
  Search,
  Sparkles,
} from "lucide-react"

import { ResumeDocument } from "@/components/resume-document"
import {
  DEFAULT_RESUME_AI_SELECTION,
  ModelReasoningSelector,
} from "@/components/resume-ai-sidebar"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Button } from "@/components/ui/button"
import { loadResumes } from "@/lib/resume-storage"
import {
  createResumeMatchingRunId,
  startResumeMatching,
  type ResumeMatchEntry,
  type ResumeMatchingResult,
} from "@/lib/resume-matching"
import type { ResumeAiSelection } from "@/lib/resume-ai"
import type { ResumeFile } from "@/lib/resume-types"
import {
  setPrimaryResumeForJob,
  type TheirStackJob,
} from "@/lib/theirstack"
import { cn } from "@/lib/utils"

export function ResumeMatchingWorkspace({
  job,
  onJobChange,
}: {
  job: TheirStackJob
  onJobChange?: (job: TheirStackJob) => void
}) {
  const [resumes, setResumes] = useState<ResumeFile[]>([])
  const [query, setQuery] = useState("")
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null)
  const [selection, setSelection] = useState<ResumeAiSelection>(DEFAULT_RESUME_AI_SELECTION)
  const [matching, setMatching] = useState<ResumeMatchingResult | null>(job.resumeMatching ?? null)
  const [primaryResume, setPrimaryResume] = useState(job.primaryResume ?? null)
  const [isMatching, setIsMatching] = useState(false)
  const [isSavingPrimary, setIsSavingPrimary] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [matchingError, setMatchingError] = useState("")
  const [primaryError, setPrimaryError] = useState("")

  useEffect(() => {
    setMatching(job.resumeMatching ?? null)
    setPrimaryResume(job.primaryResume ?? null)
  }, [job.id, job.primaryResume, job.resumeMatching])

  useEffect(() => {
    let active = true

    async function loadResumeLibrary() {
      setLoading(true)
      setError("")
      try {
        const nextResumes = await loadResumes()
        if (!active) return
        setResumes(nextResumes)
        setSelectedResumeId(
          nextResumes.find((resume) => resume.fileName === job.primaryResume?.sourceFileName)?.id ?? null,
        )
      } catch (reason) {
        if (!active) return
        setError(reason instanceof Error ? reason.message : "Could not load resumes.")
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadResumeLibrary()
    return () => { active = false }
  }, [job.id, job.primaryResume?.sourceFileName])

  const filteredResumes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return resumes

    return resumes.filter((resume) => [
      resume.data.basics?.name,
      resume.data.basics?.headline,
      resume.fileName,
    ].some((value) => value?.toLowerCase().includes(needle)))
  }, [query, resumes])

  const matchByFileName = useMemo(
    () => new Map((matching?.matches ?? []).map((match) => [match.fileName, match])),
    [matching],
  )
  const rankedResumes = useMemo(() => {
    if (!matching) return filteredResumes
    return [...filteredResumes].sort((left, right) => {
      const leftMatch = matchByFileName.get(left.fileName)
      const rightMatch = matchByFileName.get(right.fileName)
      if (leftMatch && rightMatch) return leftMatch.rank - rightMatch.rank
      if (leftMatch) return -1
      if (rightMatch) return 1
      return left.fileName.localeCompare(right.fileName)
    })
  }, [filteredResumes, matchByFileName, matching])
  const selectedResume = useMemo(
    () => resumes.find((resume) => resume.id === selectedResumeId) ?? null,
    [resumes, selectedResumeId],
  )
  const selectedResumeIsPrimary = Boolean(
    selectedResume && primaryResume && selectedResume.fileName === primaryResume.sourceFileName,
  )

  async function beginMatching() {
    if (isMatching || !resumes.length) return
    setIsMatching(true)
    setMatchingError("")
    setPrimaryError("")
    try {
      const result = await startResumeMatching({
        runId: createResumeMatchingRunId(),
        jobId: job.id,
        provider: selection.provider,
        model: selection.model,
        effort: selection.effort,
      })
      setMatching(result)
      onJobChange?.({ ...job, resumeMatching: result })
    } catch (reason) {
      setMatchingError(errorMessage(reason, "Resume matching could not be completed."))
    } finally {
      setIsMatching(false)
    }
  }

  async function savePrimaryResume() {
    if (!matching || !selectedResume || selectedResumeIsPrimary || isSavingPrimary) return
    setIsSavingPrimary(true)
    setPrimaryError("")
    try {
      const nextPrimaryResume = await setPrimaryResumeForJob(job.id, selectedResume.fileName)
      setPrimaryResume(nextPrimaryResume)
      onJobChange?.({
        ...job,
        resumeMatching: matching,
        primaryResume: nextPrimaryResume,
      })
    } catch (reason) {
      setPrimaryError(errorMessage(reason, "The primary resume could not be saved."))
    } finally {
      setIsSavingPrimary(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="gap-4 border-b lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-muted-foreground" />
              Resume matching
            </CardTitle>
            <CardDescription>
              Rank every saved resume against this role, then keep a separate job-focused copy of the resume you choose.
            </CardDescription>
          </div>
          <div className="resume-matching-controls flex flex-wrap items-center gap-2 rounded-lg border bg-background p-1.5">
            <ModelReasoningSelector disabled={isMatching} value={selection} onChange={setSelection} />
            <Button type="button" size="sm" onClick={() => void beginMatching()} disabled={isMatching || loading || !resumes.length}>
              {isMatching ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              {isMatching ? "Matching resumes" : "Begin matching"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {matchingError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive" role="alert">
              {matchingError}
            </div>
          ) : null}
          {primaryError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive" role="alert">
              {primaryError}
            </div>
          ) : null}
          {matching ? <MatchingSummary result={matching} /> : null}
          <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1.5">
              <h3 className="text-base font-medium">Resume ranking</h3>
              <p className="text-sm text-muted-foreground">
                {matching
                  ? "Hover a resume to inspect the agent's rationale, strengths, and gaps."
                  : "Your complete resume library will be evaluated when you begin matching."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <InputGroup className="resume-search w-full lg:w-72">
                <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
                <InputGroupInput
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search resumes"
                  aria-label="Search resumes"
                />
              </InputGroup>
              <div className="resume-count">
                <Grid2X2 aria-hidden="true" />
                {filteredResumes.length} {filteredResumes.length === 1 ? "resume" : "resumes"}
              </div>
            </div>
          </div>

          {loading ? <ResumeMatchingSkeletons /> : null}
          {error ? (
            <div className="resume-empty min-h-64" role="alert">
              <h2>Something went wrong</h2>
              <p>{error}</p>
            </div>
          ) : null}
          {!loading && !error && rankedResumes.length ? (
            <div className="resume-grid" role="radiogroup" aria-label="Resumes available for matching and primary selection">
              {rankedResumes.map((resume) => (
                <ResumeMatchCard
                  key={resume.id}
                  file={resume}
                  selected={resume.id === selectedResumeId}
                  isPrimary={resume.fileName === primaryResume?.sourceFileName}
                  match={matchByFileName.get(resume.fileName)}
                  onSelect={() => setSelectedResumeId(resume.id)}
                />
              ))}
            </div>
          ) : null}
          {matching && rankedResumes.length ? (
            <PrimaryResumePanel
              selectedResume={selectedResume}
              isPrimary={selectedResumeIsPrimary}
              isSaving={isSavingPrimary}
              onSave={() => void savePrimaryResume()}
            />
          ) : null}
          {!loading && !error && !filteredResumes.length ? (
            <div className="resume-empty min-h-64">
              <FileJson2 aria-hidden="true" />
              <h2>{query ? "No matching resumes" : "Your library is ready"}</h2>
              <p>{query ? "Try a name or file name." : "Add a JSON resume to the resume folder, then refresh."}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {matching ? `${matching.matches.length} resumes ranked for this job` : `${resumes.length} resumes ready to compare`}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {matching
              ? "The latest ranking is saved to this job. Run it again whenever your resumes or company research change."
              : "Begin matching uses the selected model and reasoning settings for the complete library."}
          </p>
        </div>
        <Badge variant={matching ? "secondary" : "outline"} className="w-fit shrink-0 font-normal">
          {matching ? "Ranking saved" : "Ready to match"}
        </Badge>
      </div>
    </div>
  )
}

function ResumeMatchCard({
  file,
  selected,
  isPrimary,
  match,
  onSelect,
}: {
  file: ResumeFile
  selected: boolean
  isPrimary: boolean
  match?: ResumeMatchEntry
  onSelect: () => void
}) {
  const name = resumeName(file)
  const updated = file.updatedAt
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(file.updatedAt * 1000)
    : "Local preview"
  const reasoningId = `resume-match-reasoning-${file.fileName.replace(/[^a-z0-9]+/gi, "-")}`

  return (
    <div className={cn("resume-match-card-shell", match && "has-match")}>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={`Select ${name} as the primary resume`}
        aria-describedby={match ? reasoningId : undefined}
        className={cn("resume-card h-auto w-full p-0 font-normal", selected && "resume-card-selected")}
        onClick={onSelect}
      >
        <div className="resume-card-preview" aria-hidden="true">
          <div className="resume-card-document"><ResumeDocument resume={file.data} compact /></div>
        </div>
        <div className="resume-card-info">
          <div className="min-w-0">
            <h2>{name}</h2>
            <p>{match ? `Rank #${match.rank} · Updated ${updated}` : `Updated ${updated}`}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {match ? <span className="resume-match-score">{match.score}<small>/100</small></span> : null}
            {isPrimary ? <Badge variant="secondary" className="font-normal">Primary</Badge> : null}
            <span className={cn("resume-card-select-indicator", selected && "is-selected")} aria-hidden="true">
              {selected ? <Check /> : null}
            </span>
          </div>
        </div>
      </button>
      {match ? <ResumeMatchReasoningPopover id={reasoningId} match={match} /> : null}
    </div>
  )
}

function PrimaryResumePanel({
  selectedResume,
  isPrimary,
  isSaving,
  onSave,
}: {
  selectedResume: ResumeFile | null
  isPrimary: boolean
  isSaving: boolean
  onSave: () => void
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">Choose a primary resume for this job</p>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
          {selectedResume
            ? `${resumeName(selectedResume)} will get its own job-focused copy. Your original resume stays unchanged.`
            : "Select a ranked resume above to create its job-focused copy."}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={isPrimary ? "secondary" : "default"}
        disabled={!selectedResume || isPrimary || isSaving}
        onClick={onSave}
      >
        {isSaving ? <LoaderCircle className="animate-spin" /> : <Check />}
        {isSaving ? "Saving primary" : isPrimary ? "Primary resume saved" : "Use selected resume"}
      </Button>
    </div>
  )
}

function MatchingSummary({ result }: { result: ResumeMatchingResult }) {
  const topMatch = result.matches[0]
  return (
    <div className="resume-matching-summary">
      <div className="min-w-0">
        <p className="resume-matching-summary-label">Latest AI ranking</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {result.matches.length} resumes scored out of 100. The total is calculated from six visible match dimensions.
        </p>
      </div>
      {topMatch ? (
        <Badge variant="secondary" className="w-fit shrink-0 font-normal">
          Top match · {topMatch.score}/100
        </Badge>
      ) : null}
    </div>
  )
}

function ResumeMatchReasoningPopover({ id, match }: { id: string; match: ResumeMatchEntry }) {
  const dimensions: Array<[string, number, number]> = [
    ["Role alignment", match.categoryScores.roleAlignment, 30],
    ["Relevant experience", match.categoryScores.relevantExperience, 25],
    ["Skills & technology", match.categoryScores.skillsTechnology, 20],
    ["Seniority & scope", match.categoryScores.seniorityScope, 10],
    ["Company context", match.categoryScores.companyContext, 10],
    ["Evidence clarity", match.categoryScores.evidenceClarity, 5],
  ]

  return (
    <div id={id} className="resume-match-reasoning-popover" role="tooltip">
      <div className="flex items-start justify-between gap-3">
        <p className="resume-match-reasoning-kicker">Agent rationale</p>
        <strong>{match.score}<small>/100</small></strong>
      </div>
      <p className="mt-2 text-xs leading-5 text-foreground/85">{match.summary}</p>
      <div className="resume-match-reasoning-section">
        <p>Why this score</p>
        <ul>
          {match.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}
        </ul>
      </div>
      {match.gaps.length ? (
        <div className="resume-match-reasoning-section is-gap">
          <p>Gaps to verify</p>
          <ul>
            {match.gaps.map((gap, index) => <li key={`${gap}-${index}`}>{gap}</li>)}
          </ul>
        </div>
      ) : null}
      <div className="resume-match-dimensions" aria-label="Score dimensions">
        {dimensions.map(([label, value, maximum]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}/{maximum}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResumeMatchingSkeletons() {
  return (
    <div className="resume-grid" aria-label="Loading resumes">
      {[0, 1, 2].map((item) => (
        <div className="resume-card resume-card-skeleton" key={item}>
          <div />
          <span />
        </div>
      ))}
    </div>
  )
}

function resumeName(file: ResumeFile) {
  return file.data.basics?.name || file.fileName.replace(/\.json$/i, "")
}

function errorMessage(reason: unknown, fallback: string) {
  if (typeof reason === "string" && reason.trim()) return reason
  if (reason instanceof Error && reason.message.trim()) {
    if (/invoke|tauri/i.test(reason.message)) return "Matching is available in the MuttJobs desktop app."
    return reason.message
  }
  return fallback
}
