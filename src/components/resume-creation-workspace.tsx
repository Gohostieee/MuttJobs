import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  FilePenLine,
  LoaderCircle,
  MessageSquareText,
  Sparkles,
} from "lucide-react"

import { getResumePageWidth, ResumeDocument } from "@/components/resume-document"
import { ResumeViewer } from "@/components/resume-workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { loadJobPrimaryResume } from "@/lib/resume-storage"
import type {
  ResumeMatchDimensionScores,
  ResumeMatchEntry,
} from "@/lib/resume-matching"
import type { ResumeFile } from "@/lib/resume-types"
import type { TheirStackJob } from "@/lib/theirstack"

const SCORE_DIMENSIONS: Array<{
  key: keyof ResumeMatchDimensionScores
  label: string
  maximum: number
}> = [
  { key: "roleAlignment", label: "Role alignment", maximum: 30 },
  { key: "relevantExperience", label: "Relevant experience", maximum: 25 },
  { key: "skillsTechnology", label: "Skills and technology", maximum: 20 },
  { key: "seniorityScope", label: "Seniority and scope", maximum: 10 },
  { key: "companyContext", label: "Company context", maximum: 10 },
  { key: "evidenceClarity", label: "Evidence clarity", maximum: 5 },
]

export function ResumeCreationWorkspace({
  job,
  onEditorChange,
}: {
  job: TheirStackJob
  onEditorChange?: (open: boolean) => void
}) {
  const [primaryResume, setPrimaryResume] = useState<ResumeFile | null>(null)
  const [editorFile, setEditorFile] = useState<ResumeFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true

    async function loadPrimaryResume() {
      if (!job.primaryResume) {
        setPrimaryResume(null)
        setEditorFile(null)
        setLoading(false)
        setError("")
        return
      }

      setLoading(true)
      setError("")
      try {
        const nextResume = await loadJobPrimaryResume(job.id, job.primaryResume.sourceFileName)
        if (active) setPrimaryResume(nextResume)
      } catch (reason) {
        if (!active) return
        setError(reason instanceof Error ? reason.message : "Could not load the primary resume.")
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadPrimaryResume()
    return () => { active = false }
  }, [job.id, job.primaryResume?.jobResumeFileName, job.primaryResume?.sourceFileName])

  const review = useMemo(() => {
    const sourceFileName = job.primaryResume?.sourceFileName
    if (!sourceFileName) return null
    return job.resumeMatching?.matches.find((match) => match.fileName === sourceFileName) ?? null
  }, [job.primaryResume?.sourceFileName, job.resumeMatching?.matches])

  function openPrimaryResumeEditor() {
    if (!primaryResume) return
    onEditorChange?.(true)
    setEditorFile(primaryResume)
  }

  function closePrimaryResumeEditor(updatedFile: ResumeFile) {
    setPrimaryResume(updatedFile)
    setEditorFile(null)
    onEditorChange?.(false)
  }

  if (editorFile) {
    return (
      <ResumeViewer
        file={editorFile}
        targetJobId={job.id}
        backLabel="Back to resume creation"
        onBack={closePrimaryResumeEditor}
      />
    )
  }

  if (loading) return <ResumeCreationLoading />
  if (error) return <ResumeCreationError message={error} />
  if (!job.primaryResume) return <NoPrimaryResume />
  if (!primaryResume) {
    return <PrimaryResumeUnavailable fileName={job.primaryResume.sourceFileName} />
  }

  return (
    <div className="space-y-5" data-testid="resume-creation-view">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FilePenLine className="size-4 text-muted-foreground" />
                  Primary resume
                </CardTitle>
                <CardDescription>
                  The job-scoped copy selected for this role. Open it here to tailor the document while keeping the source resume unchanged.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" size="sm" onClick={openPrimaryResumeEditor}>
                  <FilePenLine />
                  Edit job resume
                </Button>
                <Badge variant="secondary" className="w-fit shrink-0 font-normal">
                  <CheckCircle2 data-icon="inline-start" />
                  Selected
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{resumeName(primaryResume)}</span>
              <span>Source: {job.primaryResume.sourceFileName}</span>
              <span>Job copy: {primaryResume.fileName}</span>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-5">
            <div className="rounded-xl border bg-muted/30 p-3 sm:p-5">
              <ResumeDocumentPreview resume={primaryResume.data} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <ScoreCard review={review} generatedAt={job.resumeMatching?.generatedAt} />
          <AgentComments review={review} />
        </div>
      </div>
    </div>
  )
}

function ResumeDocumentPreview({ resume }: { resume: ResumeFile["data"] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  const pageWidth = getResumePageWidth(resume)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateWidth = () => setAvailableWidth(element.clientWidth)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const zoom = availableWidth > 0
    ? Math.min(1, Math.max(0.35, (availableWidth - 2) / pageWidth))
    : 1

  return (
    <div ref={containerRef} className="w-full">
      <div className="mx-auto w-max" style={{ zoom } as CSSProperties}>
        <ResumeDocument resume={resume} />
      </div>
    </div>
  )
}

function ScoreCard({ review, generatedAt }: { review: ResumeMatchEntry | null; generatedAt?: string | null }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-muted-foreground" />
          Match score
        </CardTitle>
        <CardDescription>
          The latest agent evaluation for this resume and role.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        {review ? (
          <>
            <div className="flex items-end justify-between gap-4 rounded-xl border bg-primary/[0.04] px-4 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Overall fit
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Rank #{review.rank} for this role</p>
              </div>
              <p className="text-4xl font-semibold tracking-tight text-primary">
                {review.score}<span className="ml-1 text-base font-medium text-muted-foreground">/100</span>
              </p>
            </div>
            <div className="space-y-3" aria-label="Score dimensions">
              {SCORE_DIMENSIONS.map(({ key, label, maximum }) => {
                const value = review.categoryScores[key]
                return (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium tabular-nums text-foreground">{value}/{maximum}</span>
                    </div>
                    <Progress value={(value / maximum) * 100} className="h-1.5" />
                  </div>
                )
              })}
            </div>
            <p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
              <CalendarClock className="size-3.5 shrink-0" />
              Generated {formatDate(generatedAt)}
            </p>
          </>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
            This primary resume does not have a matching review attached yet.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AgentComments({ review }: { review: ResumeMatchEntry | null }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="size-4 text-muted-foreground" />
          Agent comments
        </CardTitle>
        <CardDescription>
          Every note from the latest resume review, kept visible while you tailor the document.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {review ? (
          <>
            <CommentSection title="Overall assessment">
              <p className="text-sm leading-6 text-foreground/90">{review.summary}</p>
            </CommentSection>
            <CommentSection title="Why it received this score">
              <ol className="space-y-3">
                {review.reasons.map((reason, index) => (
                  <li key={`${reason}-${index}`} className="flex gap-3 text-sm leading-6 text-foreground/90">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ol>
            </CommentSection>
            <CommentSection title="Gaps to address or verify">
              {review.gaps.length ? (
                <ul className="space-y-3">
                  {review.gaps.map((gap, index) => (
                    <li key={`${gap}-${index}`} className="flex gap-3 text-sm leading-6 text-foreground/90">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-destructive" />
                      <span>{gap}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">No important gaps were identified.</p>
              )}
            </CommentSection>
          </>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Run resume matching first to bring the agent&apos;s comments into this creation step.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function CommentSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

function NoPrimaryResume() {
  return (
    <Card>
      <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex size-11 items-center justify-center rounded-xl border bg-muted/30">
          <FilePenLine className="size-5 text-muted-foreground" />
        </div>
        <Badge variant="secondary" className="mt-4 font-normal">Waiting for a selection</Badge>
        <h3 className="mt-3 text-base font-medium">Choose a primary resume first</h3>
        <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">
          Return to Resume matching and use the selected resume as the primary resume for this role. Its document, score, and agent comments will appear here.
        </p>
      </CardContent>
    </Card>
  )
}

function PrimaryResumeUnavailable({ fileName }: { fileName: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
        <AlertCircle className="size-6 text-destructive" />
        <h3 className="mt-4 text-base font-medium">Primary resume is unavailable</h3>
        <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">
          The selected file <span className="font-medium text-foreground">{fileName}</span> is no longer in the resume library. Re-select a resume from Resume matching to continue.
        </p>
      </CardContent>
    </Card>
  )
}

function ResumeCreationLoading() {
  return (
    <Card>
      <CardContent className="flex min-h-72 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading the primary resume...
        </div>
      </CardContent>
    </Card>
  )
}

function ResumeCreationError({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
        <AlertCircle className="size-6 text-destructive" />
        <h3 className="mt-4 text-base font-medium">Could not load the primary resume</h3>
        <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  )
}

function resumeName(file: ResumeFile) {
  return file.data.basics?.name || file.fileName.replace(/\.json$/i, "")
}

function formatDate(value: string | null | undefined) {
  if (!value) return "the latest matching run"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "the latest matching run"
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
}
