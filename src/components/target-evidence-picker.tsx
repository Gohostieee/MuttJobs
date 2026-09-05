import { useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Button } from "./ui/button"
import { workspaceError } from "@/lib/job-workspace"
import type { Evidence } from "@/lib/job-workspace"
type Reference = { entryId: string; field: string; excerpt: string }
export function TargetEvidencePicker({
  targetId,
  disabled,
  onLink,
}: {
  targetId: string
  disabled: boolean
  onLink: (value: Evidence["suggestion"]) => void
}) {
  const [references, setReferences] = useState<Reference[]>([])
  const [selected, setSelected] = useState("0")
  const [strength, setStrength] = useState("Partial")
  const [matchKind, setMatchKind] = useState("Transferable")
  const [error, setError] = useState("")
  const [loaded, setLoaded] = useState(false)
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open && !loaded)
          void invoke<Reference[]>("job_workspace_profile_entries")
            .then((values) => {
              setReferences(values)
              setLoaded(true)
            })
            .catch((cause) => setError(workspaceError(cause)))
      }}
    >
      <summary>Link existing profile evidence manually</summary>
      {error && <p role="alert">{error}</p>}
      {loaded && !references.length ? (
        <p>Add factual experience to Career Profile, then return here.</p>
      ) : (
        <>
          <select
            aria-label="Career Profile passage"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {references.map((reference, i) => (
              <option value={i} key={reference.field}>
                {reference.excerpt.replace(/<[^>]*>/g, "").slice(0, 140)}
              </option>
            ))}
          </select>
          {references[Number(selected)] && (
            <blockquote>{references[Number(selected)].excerpt}</blockquote>
          )}
          <label>
            Support strength
            <select
              value={strength}
              onChange={(event) => setStrength(event.target.value)}
            >
              <option>Strong</option>
              <option>Partial</option>
              <option>Conflicting</option>
            </select>
          </label>
          <label>
            Connection
            <select
              value={matchKind}
              onChange={(event) => setMatchKind(event.target.value)}
            >
              <option>Direct</option>
              <option>Transferable</option>
              <option>Unknown</option>
            </select>
          </label>
          <Button
            size="sm"
            disabled={disabled || !references[Number(selected)]}
            onClick={() =>
              onLink({
                targetId,
                strength,
                matchKind,
                explanation:
                  "User selected this profile passage as potentially relevant support. Review the connection before using it.",
                references: [references[Number(selected)]],
              })
            }
          >
            Link for review
          </Button>
        </>
      )}
      <Button
        variant="link"
        size="sm"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent("muttjobs:navigate", { detail: "profile" }),
          )
        }
      >
        Open Career Profile
      </Button>
    </details>
  )
}
