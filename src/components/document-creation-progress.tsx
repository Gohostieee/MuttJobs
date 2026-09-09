import { useEffect, useRef, useState } from "react"
import { Button } from "./ui/button"
import { ResumeDocument } from "./resume-document"
import { CoverLetterDocument } from "./cover-letter-document"
import { normalizeAndValidateResume } from "@/lib/resume-validation"
import { normalizeAndValidateCoverLetter } from "@/lib/cover-letter-validation"
import type { CreationSession } from "@/lib/job-workspace"

export function DocumentCreationProgress({ session, busy, onResume, onCancel, onGap, onLayout, onRebase, onDiscard, onPageMode, onPin, onRevise, onOmit }: {
  session: CreationSession
  busy: boolean
  onResume: () => void
  onCancel: () => void
  onGap: (targetId: string) => void
  onLayout: (measurement: { pages: number; clipped: boolean; readable: boolean }) => void
  onRebase: () => void
  onDiscard: () => void
  onPageMode: (mode: "one" | "two") => void
  onPin: (pinned: boolean) => void
  onRevise: (text: string) => void
  onOmit: (target: string) => void
}) {
  const [repairText, setRepairText] = useState<string | null>(null)
  const preview = useRef<HTMLDivElement>(null)
  const report = useRef(onLayout)
  report.current = onLayout
  useEffect(() => {
    if (session.state !== "Ready for review") return
    let disposed = false
    let timer = 0
    let last = session.layout?.draftRevision === session.revision
      ? JSON.stringify({ pages: session.layout.pages, clipped: session.layout.clipped, readable: session.layout.readable }) : ""
    const measure = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (disposed || !preview.current) return
        const sheet = preview.current.querySelector<HTMLElement>("[data-page-count]") ?? preview.current.firstElementChild as HTMLElement | null
        if (!sheet || !sheet.clientWidth) return
        const typography = session.artifact === "resume" ? normalizeAndValidateResume(session.draft).metadata.typography : normalizeAndValidateCoverLetter(session.draft).metadata.typography
        const measurement = { pages: Number(sheet.dataset.pageCount || 1), clipped: sheet.scrollWidth > sheet.clientWidth + 2 || !!sheet.querySelector(".resume-page-break.is-content-cut"), readable: !!sheet.textContent?.trim() && typography.body.fontSize >= 9 && typography.body.lineHeight >= 1 }
        const signature = JSON.stringify(measurement)
        if (signature !== last) { last = signature; report.current(measurement) }
      }, 600)
    }
    const resize = new ResizeObserver(measure)
    const changes = new MutationObserver(measure)
    if (preview.current) {
      resize.observe(preview.current)
      changes.observe(preview.current, { subtree: true, attributes: true, attributeFilter: ["data-page-count", "class"] })
    }
    document.fonts.addEventListener("loadingdone", measure)
    void document.fonts.ready.then(() => { if (!disposed) measure() })
    return () => {
      disposed = true
      window.clearTimeout(timer)
      resize.disconnect()
      changes.disconnect()
      document.fonts.removeEventListener("loadingdone", measure)
    }
  }, [session.id, session.revision, session.state])
  const resumable = ["Interrupted", "Cancelled", "Failed", "Paused for input", "Ready for review"].includes(session.state)
  const gaps = session.plan.filter((p) => p.disposition !== "draft")
  const finding = session.findings.findLast((f) => f.error)?.error
  const failedPassage = session.findings.findLast((f) => f.attemptedTool?.text)?.attemptedTool?.text
  return <section className="creation-progress" aria-label="Document creation">
    <div className="targets-heading">
      <div>
        <p className="job-eyebrow">{session.mode === "audit" ? "Saved document assessment" : "Your tailored draft"}</p>
        <h3 role="status">{session.state}</h3>
        <p>{session.passages.length} {session.passages.length === 1 ? "passage" : "passages"} written · {session.turns} of {session.turnLimit} writing and checking steps</p>
      </div>
      {busy && <Button variant="outline" onClick={onCancel}>Cancel creation</Button>}
      {resumable && session.mode !== "audit" && <Button disabled={busy} onClick={onResume}>{session.state === "Ready for review" ? "Continue draft" : "Resume draft"}</Button>}
    </div>
    <p className="text-sm text-muted-foreground">{session.model} · {session.effort} reasoning. Your saved document changes only when you accept this draft.</p>
    {resumable && session.state !== "Ready for review" && finding && <p role="alert">{finding.message}</p>}
    {session.state === "Paused for input" && <details>
      <summary>Resolve drafting blockers</summary>
      {failedPassage && <div className="grid gap-2 py-3"><label htmlFor={`repair-${session.id}`}>Revise the unsupported passage</label><textarea id={`repair-${session.id}`} value={repairText ?? failedPassage} onChange={(event) => setRepairText(event.target.value)} /><Button disabled={busy || !(repairText ?? failedPassage).trim()} onClick={() => onRevise(repairText ?? failedPassage)}>Check revised wording</Button></div>}
      {session.plan.filter((item) => item.disposition === "draft").map((item) => <div key={item.target} className="flex flex-wrap gap-2 py-2"><span>{session.targets.find((target) => target.handle === item.target)?.target.title}</span><Button variant="outline" disabled={busy} onClick={() => onOmit(item.target)}>Omit and continue</Button></div>)}
    </details>}
    <div ref={preview} className="creation-document-preview" aria-label="Current draft preview">
      {session.artifact === "resume"
        ? <ResumeDocument resume={normalizeAndValidateResume(session.draft)} />
        : <CoverLetterDocument letter={normalizeAndValidateCoverLetter(session.draft)} />}
    </div>
    {session.layout && <p role="status">{session.layout.pages} {session.layout.pages === 1 ? "page" : "pages"} · {session.layout.clipped || !session.layout.readable ? "Layout needs attention before saving" : "Readable text, no horizontal clipping detected"}</p>}
    {!busy && !["Accepted", "Rejected"].includes(session.state) && <details>
      <summary>Draft options</summary>
      <div className="flex flex-wrap items-center gap-3 py-3">
        <label>Page target <select aria-label="Draft page target" value={session.pageMode} onChange={(event) => onPageMode(event.target.value as "one" | "two")}><option value="one">One page</option><option value="two">Two pages</option></select></label>
        {finding?.code === "STALE_DOCUMENT_BASE" && <Button variant="outline" onClick={onRebase}>Rebase keeping saved edits</Button>}
        <Button variant="ghost" onClick={onDiscard}>Discard draft</Button>
        <label><input type="checkbox" checked={session.pinned ?? false} onChange={(event) => onPin(event.target.checked)} /> Keep diagnostic history</label>
      </div>
    </details>}
    {gaps.length > 0 && <details className="creation-gaps">
      <summary>{gaps.length} requirements left out of this draft</summary>
      {gaps.map((gap) => {
        const target = session.targets.find((t) => t.handle === gap.target)?.target
        return <article key={gap.target}>
          <strong>{target?.title}</strong><p>{gap.reason}</p>
          {target && <Button variant="outline" disabled={busy} onClick={() => onGap(target.id)}>Add relevant experience</Button>}
        </article>
      })}
    </details>}
  </section>
}
