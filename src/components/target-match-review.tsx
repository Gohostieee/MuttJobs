import { Check } from "lucide-react"
import { useState } from "react"
import { Button } from "./ui/button"
import { TargetEvidenceInput } from "./target-evidence-input"
import { TargetEvidencePicker } from "./target-evidence-picker"
import { workspaceError, type Evidence, type Target } from "@/lib/job-workspace"

export function TargetMatchReview({ target, evidence, disabled, onDone, onMatch, onReview, onLink }: {
  target: Target
  evidence: Evidence[]
  disabled: boolean
  onDone: () => void
  onMatch: () => void
  onReview: (id: string, review: "Confirmed" | "Rejected") => void
  onLink: (suggestion: Evidence["suggestion"]) => Promise<void>
}) {
  const [error, setError] = useState("")
  const usable = evidence.filter((e) => e.review !== "Rejected" &&
    ["Strong", "Partial"].includes(e.suggestion.strength) && e.suggestion.references.length > 0)
  const pending = usable.filter((e) => e.review !== "Confirmed")
  const confirmed = usable.filter((e) => e.review === "Confirmed")
  const current = pending[0] ?? confirmed[0]
  const complete = !!confirmed.length && !pending.length
  const input = <TargetEvidenceInput targetId={target.id} label={target.interpretation}
    disabled={disabled} onLink={onLink} />

  return <div className="target-match-review">
    <div className="match-instruction" aria-live="polite">
      {complete && <Check aria-hidden="true" className="size-5" />}
      <h3>{complete ? "Match confirmed" : current ? "Does this experience fit?" : evidence.length ? "Add experience for this requirement" : "Find matching experience"}</h3>
      <p>{complete ? "Nothing else to do for this match." : current
        ? "Confirm it if it supports this requirement. Otherwise, choose another match."
        : evidence.length ? "No usable match yet. Describe a relevant example from your work."
        : "Search your Career Profile for experience that supports this requirement."}</p>
    </div>
    {current && <div className="match-excerpt">
      <small>From your Career Profile</small>
      {current.suggestion.references.map((r, i) => <blockquote key={i}>{r.excerpt}</blockquote>)}
      {current.review === "Needs review" && <p role="status">This match changed. Please check it again.</p>}
    </div>}
    {current && <div className="match-actions">
      {complete ? <Button onClick={onDone}>Done</Button> : <>
        <Button disabled={disabled} onClick={() => onReview(current.id, "Confirmed")}>Yes, use this experience</Button>
        <Button variant="outline" disabled={disabled} onClick={() => onReview(current.id, "Rejected")}>Not a match</Button>
      </>}
      {pending.length > 1 && <small>{pending.length} matches to review</small>}
    </div>}
    {!current && (evidence.length ? input : <Button disabled={disabled} onClick={onMatch}>Find a match</Button>)}
    <details className="match-secondary">
      <summary>{current ? "Change or add experience" : "Other ways to add experience"}</summary>
      {(!!current || !evidence.length) && input}
      <TargetEvidencePicker targetId={target.id} disabled={disabled} onLink={(value) => {
        setError("")
        void onLink(value).catch((cause) => setError(workspaceError(cause)))
      }} />
      {error && <p role="alert">{error}</p>}
      {complete && confirmed.map((e) => <div key={e.id}>
        {confirmed.length > 1 && <p>{e.suggestion.references.map((r) => r.excerpt).join(" ")}</p>}
        <Button variant="outline" disabled={disabled} onClick={() => onReview(e.id, "Rejected")}>Remove confirmed match</Button>
      </div>)}
      {!!current && <details><summary>Why this matched</summary><p>{current.suggestion.explanation}</p></details>}
    </details>
  </div>
}
