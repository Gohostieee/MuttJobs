import { useEffect, useState } from "react"
import {
  AlertCircle,
  FilePenLine,
  LoaderCircle,
} from "lucide-react"

import { ResumeViewer } from "@/components/resume-workspace"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { loadJobPrimaryResume } from "@/lib/resume-storage"
import type { ResumeFile } from "@/lib/resume-types"
import type { TheirStackJob } from "@/lib/theirstack"

export function ResumeCreationWorkspace({
  job,
  onEditorChange,
  onBackToJob,
}: {
  job: TheirStackJob
  onEditorChange?: (open: boolean) => void
  onBackToJob: () => void
}) {
  const [primaryResume, setPrimaryResume] = useState<ResumeFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

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
        fullScreen
        onBack={(updatedFile) => {
          setPrimaryResume(updatedFile)
          onBackToJob()
        }}
      />
    )
  }

  if (loading) return <ResumeCreationLoading />
  if (error) return <ResumeCreationError message={error} />
  if (!job.primaryResume) return <NoPrimaryResume />
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
