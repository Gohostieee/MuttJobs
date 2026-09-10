import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Button } from "@/components/ui/button"
import { ResumeViewer } from "./resume-workspace"
import { loadJobPrimaryResume, loadResumes } from "@/lib/resume-storage"
import type { ResumeFile } from "@/lib/resume-types"
import type { TheirStackJob } from "@/lib/theirstack"
import { workspaceError } from "@/lib/job-workspace"

export function JobResumeEditor({ job, onBack }: { job: TheirStackJob; onBack: () => void }) {
  const [file, setFile] = useState<ResumeFile | null>(null)
  const [library, setLibrary] = useState<ResumeFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => {
    let disposed = false
    void (async () => {
      try { const saved = await loadJobPrimaryResume(job.id); if (!disposed) setFile(saved) }
      catch {
        try { const files = await loadResumes(); if (!disposed) setLibrary(files) }
        catch (cause) { if (!disposed) setError(workspaceError(cause)) }
      } finally { if (!disposed) setLoading(false) }
    })()
    return () => { disposed = true }
  }, [job.id])
  async function choose(source: ResumeFile) {
    setLoading(true); setError("")
    try {
      await invoke("set_primary_resume_for_job", { jobId: job.id, resumeFileName: source.fileName })
      setFile(await loadJobPrimaryResume(job.id))
    } catch (cause) { setError(workspaceError(cause)) }
    finally { setLoading(false) }
  }
  if (file) return <ResumeViewer key={file.path} file={file} targetJobId={job.id} backLabel="Back to job" onBack={onBack} />
  return <main className="flex flex-1 flex-col items-start gap-4 p-8">
    <Button variant="ghost" onClick={onBack}>Back to job</Button>
    <h1 className="text-xl font-semibold">Resume for {job.jobTitle}</h1>
    {loading ? <p role="status">Opening resume…</p> : <p className="text-sm text-muted-foreground">Choose a saved resume to edit for this job.</p>}
    {error && <p role="alert">{error}</p>}
    {library.map(source => <Button key={source.path} variant="outline" disabled={loading} onClick={() => void choose(source)}>{source.fileName}</Button>)}
    {!loading && !library.length && <p>No saved resumes are available.</p>}
  </main>
}
