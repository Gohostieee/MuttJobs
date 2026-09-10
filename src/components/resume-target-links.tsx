import { useEffect, useRef, useState, type RefObject, type PointerEvent } from "react"
import { ArrowUpRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ResumeTargetCheck } from "@/lib/resume-target-check"
import { locateResumePassage, markResumeBulletCoverage } from "@/lib/resume-passage-location"

export function ResumeTargetLinks({ check, viewportRef, width, onWidthChange }: {
  check: ResumeTargetCheck
  viewportRef: RefObject<HTMLDivElement | null>
  width: number
  onWidthChange: (width: number) => void
}) {
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const [resizing, setResizing] = useState(false)
  const resize = (next: number) => onWidthChange(Math.min(520, Math.max(220, next)))
  function finishResize(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    setResizing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const [active, setActive] = useState("")
  const [links, setLinks] = useState<{ targetId: string; quote: string; label: string; element: HTMLElement }[]>([])
  useEffect(() => {
    const root = viewportRef.current
    if (!root) return
    const next = check.result?.assessments.filter(item => item.matched).flatMap(item =>
      item.passages.flatMap(passage => locateResumePassage(root, passage).map(location => ({ ...location, targetId: item.targetId, quote: passage.quote })))) || []
    setLinks(next)
    setActive("")
    const clearCoverage = markResumeBulletCoverage(root, next.map(link => link.element))
    return () => {
      clearCoverage()
      next.forEach(link => link.element.removeAttribute("data-target-highlight"))
    }
  }, [check, viewportRef])

  function reveal(index: number) {
    links.forEach(link => link.element.removeAttribute("data-target-highlight"))
    const link = links[index]
    if (!link?.element.isConnected) return
    setActive(String(index))
    link.element.dataset.targetHighlight = "true"
    link.element.scrollIntoView({ block: "center", inline: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })
  }

  const matched = check.result?.assessments.filter(item => item.matched) || []
  return <><div className="resume-target-resize-handle" data-resizing={resizing || undefined}
    role="separator" tabIndex={0} aria-label="Resize matched text panel" aria-orientation="vertical"
    aria-valuemin={220} aria-valuemax={520} aria-valuenow={Math.round(width)}
    title="Drag to resize matched text"
    onPointerDown={event => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.focus()
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { pointerId: event.pointerId, x: event.clientX, width }
      setResizing(true)
    }}
    onPointerMove={event => {
      if (drag.current?.pointerId === event.pointerId) resize(drag.current.width + event.clientX - drag.current.x)
    }}
    onPointerUp={finishResize} onPointerCancel={finishResize}
    onLostPointerCapture={() => { drag.current = null; setResizing(false) }}
    onKeyDown={event => {
      const step = event.shiftKey ? 48 : 16
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
      event.preventDefault()
      resize(event.key === "Home" ? 220 : event.key === "End" ? 520 : width + (event.key === "ArrowRight" ? step : -step))
    }}
  /><aside className="resume-target-links" aria-label="Matched target locations">
    <header><h2>Matched text</h2><p>{matched.length} matched {matched.length === 1 ? "target" : "targets"} · Select text to locate it in your resume.</p></header>
    <p className="resume-target-coverage-legend"><span data-coverage="matched">Green: matched bullet</span><span data-coverage="unmatched">Red: no target match</span></p>
    {!matched.length && <p className="resume-targets-message">No targets matched yet. Update your resume and check again.</p>}
    {matched.map(assessment => <section key={assessment.targetId}>
      <h3><Check aria-hidden="true" />{check.targets.find(target => target.id === assessment.targetId)?.title || "Matched target"}</h3>
      {links.map((link, index) => link.targetId === assessment.targetId && <Button key={index} variant="ghost" className="resume-target-location h-auto whitespace-normal" aria-pressed={active === String(index)} onClick={() => reveal(index)}>
        <span><span className="resume-target-location-label">{link.label}</span><span className="resume-target-location-quote">{link.quote}</span></span><ArrowUpRight aria-hidden="true" />
      </Button>)}
      {!links.some(link => link.targetId === assessment.targetId) && <p className="resume-targets-message">The cited text could not be located. Check the resume again to refresh its links.</p>}
    </section>)}
  </aside></>
}
