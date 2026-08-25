import { useEffect, useState } from "react"
import {
  AlertCircle,
  LoaderCircle,
  Mail,
} from "lucide-react"

import { CoverLetterViewer } from "@/components/cover-letter-workspace"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { loadOrCreateJobCoverLetter } from "@/lib/cover-letter-storage"
import type { CoverLetterFile } from "@/lib/cover-letter-types"
import type { TheirStackJob } from "@/lib/theirstack"

export function CoverLetterCreationWorkspace({
  job,
  onEditorChange,
  onBackToJob,
}: {
  job: TheirStackJob
  onEditorChange?: (open: boolean) => void
  onBackToJob: () => void
}) {
  const [coverLetter, setCoverLetter] = useState<CoverLetterFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true

    async function loadCoverLetter() {
      setLoading(true)
      setError("")
      try {
        const nextCoverLetter = await loadOrCreateJobCoverLetter(job)
        if (active) setCoverLetter(nextCoverLetter)
      } catch (reason) {
        if (!active) return
        setError(reason instanceof Error ? reason.message : "Could not prepare this cover letter.")
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadCoverLetter()
    return () => { active = false }
  }, [job])

  useEffect(() => {
    if (!coverLetter) return
    onEditorChange?.(true)
    return () => onEditorChange?.(false)
  }, [coverLetter, onEditorChange])

  if (coverLetter) {
    return (
      <CoverLetterViewer
        file={coverLetter}
        targetJobId={job.id}
        backLabel="Back to job"
        onBack={(updatedFile) => {
          setCoverLetter(updatedFile)
          onBackToJob()
        }}
      />
    )
  }

  if (loading) return <CoverLetterCreationLoading />
  return <CoverLetterCreationError message={error} />
}

function CoverLetterCreationLoading() {
  return (
    <Card>
      <CardContent className="flex min-h-72 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Preparing a cover letter for this role...
        </div>
      </CardContent>
    </Card>
  )
}

function CoverLetterCreationError({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex size-11 items-center justify-center rounded-xl border bg-muted/30">
          <Mail className="size-5 text-muted-foreground" />
        </div>
        <Badge variant="secondary" className="mt-4 font-normal">Cover letter unavailable</Badge>
        <AlertCircle className="mt-4 size-6 text-destructive" />
        <h3 className="mt-3 text-base font-medium">Could not prepare this cover letter</h3>
        <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  )
}
