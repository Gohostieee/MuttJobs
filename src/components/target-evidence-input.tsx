import { useState } from "react"
import { Button } from "./ui/button"
import { submitProfileEvidence } from "@/lib/profile-storage"
import { workspaceError, type Evidence } from "@/lib/job-workspace"

export function TargetEvidenceInput({ targetId, label, disabled, onLink }: {
  targetId: string
  label: string
  disabled: boolean
  onLink: (suggestion: Evidence["suggestion"]) => Promise<void>
}) {
  const [text, setText] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [saved, setSaved] = useState<Evidence["suggestion"] | null>(null)
  async function submit() {
    setSaving(true)
    setError("")
    try {
      const suggestion = saved ?? {
        targetId, strength: "Partial", matchKind: "Unknown",
        explanation: "User submitted this experience for this target. Review its relevance and support strength.",
        references: [await submitProfileEvidence(label, text)],
      }
      setSaved(suggestion)
      setMessage("Saved to Career Profile for future matches.")
      await onLink(suggestion)
      setMessage("Saved to Career Profile and linked below for review. Available for future matches.")
      setText("")
      setSaved(null)
    } catch (cause) {
      setError(workspaceError(cause))
    } finally {
      setSaving(false)
    }
  }
  return <div className="target-edit-form">
    <label>
      Add evidence from your experience
      <textarea value={text} disabled={disabled || saving || !!saved}
        placeholder="Describe what you did, where and when, and the outcome. Include specific examples or supporting links."
        onChange={(event) => setText(event.target.value)} />
    </label>
    <small>Your account will be saved in Career Profile and used in future job matches.</small>
    <Button disabled={disabled || saving || (!saved && !text.trim())} onClick={() => void submit()}>
      {saving ? "Saving…" : saved ? "Retry linking saved evidence" : "Save evidence to Career Profile"}
    </Button>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
