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
      What did you do?
      <textarea value={text} disabled={disabled || saving || !!saved}
        placeholder="Example: At Acme, I led a product launch that increased signups by 20%."
        onChange={(event) => setText(event.target.value)} />
    </label>
    <small>Saved to your Career Profile for future matches.</small>
    <Button disabled={disabled || saving || (!saved && !text.trim())} onClick={() => void submit()}>
      {saving ? "Saving…" : saved ? "Retry linking saved evidence" : "Save and review match"}
    </Button>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
