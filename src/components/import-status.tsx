import { CollapsibleContent } from "./ui/collapsible"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./ai-elements/reasoning"
import { Conversation, ConversationContent, ConversationScrollButton } from "./ai-elements/conversation"
import { useState } from "react"
import { CircleCheck, CircleX, LoaderCircle, X } from "lucide-react"
import { AgentActivityTrace, type AgentActivity } from "@/components/resume-ai-sidebar"
import { Button } from "@/components/ui/button"

export function useImportDismissals(scope: "resume" | "job") {
  const key = `muttjobs.dismissed-imports.${scope}`
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) || "[]")
      return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []
    } catch { return [] }
  })
  const [dismissError, setDismissError] = useState("")
  function dismiss(id: string) {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) || "[]")
      const ids = Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : []
      const next = [...new Set([...ids, ...dismissed, id])]
      localStorage.setItem(key, JSON.stringify(next))
      setDismissed(next)
      setDismissError("")
    } catch {
      setDismissError("Could not save this dismissal. Please try again.")
    }
  }
  return { isDismissed: (id: string) => dismissed.includes(id), dismiss, dismissError }
}

export function ImportStatus({ title, status, stage, metadata, error, activities, onDismiss }: {
  title: string
  status: string
  stage: string
  metadata: string
  error: string | null
  activities: AgentActivity[]
  onDismiss: () => void
}) {
  const running = status === "queued" || status === "running"
  const label = status === "failed" ? "Import failed" : running ? "Importing" : "Imported"
  return (
    <article className={`import-status is-${status}`} aria-label={`${title}: ${label}`}>
      <div className="import-status-row">
        <span className="import-status-icon" aria-hidden="true">
          {running ? <LoaderCircle className="animate-spin" /> : status === "failed" ? <CircleX /> : <CircleCheck />}
        </span>
        <div className="import-status-copy">
          <div className="import-status-heading"><strong title={title}>{title}</strong><span role="status">{label}</span></div>
          <p title={error || stage}>{error || stage}</p>
        </div>
        {!running && <Button variant="ghost" size="sm" onClick={onDismiss} aria-label={`Dismiss import: ${title}`} title="Permanently dismiss this import"><X aria-hidden="true" /> Dismiss</Button>}
      </div>
      <Reasoning className="import-status-details" isStreaming={running}>
        <ReasoningTrigger type="button" getThinkingMessage={() => <span>{running ? "Live import activity" : "Import details"}</span>} />
        <ReasoningContent>{metadata}</ReasoningContent>
        <CollapsibleContent><Conversation className="h-64"><ConversationContent className="import-status-detail-body">
          <p className="text-xs text-muted-foreground">{metadata}</p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {activities.length ? <AgentActivityTrace activities={activities} isStreaming={running} /> : <p className="text-xs text-muted-foreground">{running ? "Waiting for activity…" : "No activity recorded."}</p>}
        </ConversationContent><ConversationScrollButton type="button" /></Conversation></CollapsibleContent>
      </Reasoning>
    </article>
  )
}
