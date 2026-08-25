import { useEffect, useState } from "react"
import {
  AlertCircle,
  FilePenLine,
  LoaderCircle,
  Sparkles,
} from "lucide-react"

import {
  DEFAULT_RESUME_AI_SELECTION,
  ModelReasoningSelector,
} from "@/components/resume-ai-sidebar"
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
import {
  createPrimaryResumeGenerationRunId,
  generatePrimaryResumeFromProfile,
} from "@/lib/profile-resume-generation"
import { loadJobPrimaryResume } from "@/lib/resume-storage"
import type { ResumeFile } from "@/lib/resume-types"
import type { TheirStackJob } from "@/lib/theirstack"

export function ResumeCreationWorkspace({
  job,
  onJobChange,
  onEditorChange,
  onBackToJob,
}: {
  job: TheirStackJob
  onJobChange?: (job: TheirStackJob) => void
  onEditorChange?: (open: boolean) => void
  onBackToJob: () => void
}) {
  const [primaryResume, setPrimaryResume] = useState<ResumeFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selection, setSelection] = useState(DEFAULT_RESUME_AI_SELECTION)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState("")

  async function generateFromProfile(confirmReplacement: boolean) {
    if (isGenerating) return null
    if (confirmReplacement && !window.confirm(
      "A successful rebuild will replace this job's current primary resume with a new version built from the latest saved Career Profile. Continue?",
    )) return null

    setIsGenerating(true)
    setGenerationError("")
    try {
      const result = await generatePrimaryResumeFromProfile({
        runId: createPrimaryResumeGenerationRunId(),
        jobId: job.id,
        provider: selection.provider,
        model: selection.model,
        effort: selection.effort,
      })
      setPrimaryResume(result.file)
      onJobChange?.({ ...job, primaryResume: result.primaryResume })
      return result.file
    } catch (reason) {
      const message = reason instanceof Error
        ? reason.message
        : typeof reason === "string" && reason.trim()
          ? reason
          : "Could not build a resume from the Career Profile. Complete your Career Profile and try again."
      setGenerationError(message)
      throw new Error(message)
    } finally {
      setIsGenerating(false)
    }
  }

  useEffect(() => {
    let active = true

    async function loadPrimaryResume() {
      if (!job.primaryResume) {
        setPrimaryResume(null)
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

  useEffect(() => {
    if (!primaryResume) return
    onEditorChange?.(true)
    return () => onEditorChange?.(false)
  }, [onEditorChange, primaryResume])

  if (primaryResume) {
    return (
      <ResumeViewer
        file={primaryResume}
        targetJobId={job.id}
        backLabel="Back to job"
        rebuildLabel="Rebuild from Profile"
        rebuildSelection={(
          <ModelReasoningSelector value={selection} onChange={setSelection} disabled={isGenerating} />
        )}
        onRebuild={() => generateFromProfile(true)}
        onBack={(updatedFile) => {
          setPrimaryResume(updatedFile)
          onBackToJob()
        }}
      />
    )
  }

  if (loading) return <ResumeCreationLoading />
  if (error) return <ResumeCreationError message={error} />
  if (!job.primaryResume) {
    return (
      <NoPrimaryResume
        selection={selection}
        onSelectionChange={setSelection}
        isGenerating={isGenerating}
        error={generationError}
        onGenerate={() => void generateFromProfile(false)}
      />
    )
  }
}

function NoPrimaryResume({
  selection,
  onSelectionChange,
  isGenerating,
  error,
  onGenerate,
}: {
  selection: typeof DEFAULT_RESUME_AI_SELECTION
  onSelectionChange: (selection: typeof DEFAULT_RESUME_AI_SELECTION) => void
  isGenerating: boolean
  error: string
  onGenerate: () => void
}) {
  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          Create from Career Profile
        </CardTitle>
        <CardDescription>
          Build a selective, one-page primary resume for this role from your complete saved Profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex size-11 items-center justify-center rounded-xl border bg-muted/30">
          <FilePenLine className="size-5 text-muted-foreground" />
        </div>
        <Badge variant="secondary" className="mt-4 font-normal">Profile is the source</Badge>
        <h3 className="mt-3 text-base font-medium">Create a job-specific primary resume</h3>
        <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">
          The generator will select supported evidence from your Career Profile, target it to this job, and keep private Profile preferences out of the resume.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <ModelReasoningSelector
            value={selection}
            onChange={onSelectionChange}
            disabled={isGenerating}
          />
          <Button type="button" onClick={onGenerate} disabled={isGenerating}>
            {isGenerating ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            {isGenerating ? "Creating from Profile..." : "Create from Career Profile"}
          </Button>
        </div>
        {error ? (
          <p className="mt-4 max-w-xl text-sm text-destructive" role="alert">{error}</p>
        ) : null}
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
