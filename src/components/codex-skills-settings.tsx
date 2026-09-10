import { useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import type { CodexProviderSettings } from "@/lib/agent-providers"

type Catalog = {
  cwd: string
  skills: { name: string; description: string; path: string; scope: string; enabled: boolean }[]
  errors: { path: string | null; message: string }[]
}

export function CodexSkillsSettings({ settings }: { settings: CodexProviderSettings | null }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const generation = useRef(0)
  const enabled = settings?.enabled
  useEffect(() => {
    let disposed = false
    generation.current++
    setSaving(null)
    setCatalog(null)
    setError(null)
    setBusy(Boolean(enabled))
    if (!enabled) return
    void invoke<Catalog>("get_codex_skills")
      .then((result) => { if (!disposed) setCatalog(result) })
      .catch((cause: unknown) => { if (!disposed) setError(typeof cause === "string" ? cause : cause instanceof Error ? cause.message : "Codex skills could not be loaded.") })
      .finally(() => { if (!disposed) setBusy(false) })
    return () => { disposed = true; generation.current++ }
  }, [enabled, settings?.executableMode, settings?.executablePath, revision])
  const query = search.trim().toLowerCase()
  const skills = (catalog?.skills ?? []).filter((skill) => `${skill.name} ${skill.description} ${skill.scope} ${skill.path}`.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name))
  const count = catalog?.skills.filter((skill) => skill.enabled).length ?? 0
  const pageCount = Math.max(1, Math.ceil(skills.length / 10))
  const currentPage = Math.min(page, pageCount - 1)
  async function toggle(path: string, next: boolean) {
    const current = generation.current
    setSaving(path)
    setError(null)
    try {
      const result = await invoke<Catalog>("set_codex_skill_enabled", { path, enabled: next })
      if (generation.current === current) setCatalog(result)
    } catch (cause) {
      if (generation.current === current) setError(typeof cause === "string" ? cause : "Could not save the skill preference. Try again.")
    } finally { if (generation.current === current) setSaving(null) }
  }
  return <Card className="mt-6 min-w-0" aria-label="Codex skills">
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>Codex skills</CardTitle>
        <Button variant="outline" size="sm" disabled={!enabled || busy || saving !== null} onClick={() => setRevision((value) => value + 1)}>
          {busy ? <Spinner /> : <RefreshCw data-icon="inline-start" />} Refresh skills
        </Button>
      </div>
      <CardDescription>Choose skills for MuttJobs only. Global settings stay unchanged. Applies to new runs.</CardDescription>
    </CardHeader>
    <CardContent className="flex min-w-0 flex-col gap-4">
      {!enabled ? <p className="text-sm text-muted-foreground">{settings ? "Enable the Codex provider to view its skills." : "Waiting for provider settings…"}</p> : null}
      {busy ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Reading skills from Codex…</p> : null}
      {error ? <Alert variant="destructive"><AlertTitle>Skill settings unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {catalog ? <>
        <div className="flex flex-wrap gap-2" role="status"><Badge variant="secondary">{count} enabled</Badge><Badge variant="outline">{catalog.skills.length - count} disabled</Badge></div>
        <Input aria-label="Search Codex skills" placeholder="Search skills…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} />
        {catalog.errors.map((issue, index) => <Alert key={index} variant="destructive"><AlertTitle>Skill load error</AlertTitle><AlertDescription><p>{issue.message}</p>{issue.path ? <p className="break-all">{issue.path}</p> : null}</AlertDescription></Alert>)}
        {skills.length ? <ul className="min-w-0 divide-y">{skills.slice(currentPage * 10, currentPage * 10 + 10).map((skill) => <li key={`${skill.path}:${skill.name}`} className="flex min-w-0 items-start gap-3 py-2 first:pt-0 last:pb-0">
          <details className="min-w-0 flex-1 text-sm"><summary className="cursor-pointer break-all font-medium">{skill.name}</summary><p className="mt-2 break-words text-xs text-muted-foreground">{skill.description}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{skill.scope}</p><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{skill.path}</p></details>
          {saving === skill.path ? <Spinner /> : null}
          <Switch aria-label={`Enable ${skill.name} for MuttJobs`} checked={skill.enabled} disabled={saving !== null || busy || !enabled} onCheckedChange={(value) => void toggle(skill.path, value)} />
        </li>)}</ul> : <Empty><EmptyHeader><EmptyTitle>{query ? "No skills match your search" : "Codex reported no skills"}</EmptyTitle></EmptyHeader></Empty>}
        {pageCount > 1 ? <div className="flex items-center justify-between gap-2"><Button variant="ghost" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="text-xs text-muted-foreground">{currentPage + 1} / {pageCount}</span><Button variant="ghost" size="sm" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next</Button></div> : null}
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Workspace and scope</summary><p className="mt-2 break-all font-mono">{catalog.cwd}</p><p className="mt-2">Preferences are saved with MuttJobs and supplied only to its Codex runs. Enabled means available to use, not already invoked. Existing conversations retain instructions already loaded. Job analysis and resume target checks disable plugin skills; document creation runs without ambient skills.</p></details>
      </> : null}
    </CardContent>
  </Card>
}
