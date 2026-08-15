import { useRef, useState } from "react"
import type { ChatStatus, UIMessage } from "ai"
import {
  Bot,
  Check,
  CircleAlert,
  FileJson2,
  History,
  RotateCcw,
  Sparkles,
  WandSparkles,
} from "lucide-react"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { runResumeAiJob } from "@/lib/resume-ai"
import type { ResumeData } from "@/lib/resume-types"

export type ResumeActivityEntry = {
  id: string
  label: string
  detail: string
  createdAt: number
}

type ResumeAiSidebarProps = {
  fileName: string
  resumePath: string
  activityHistory: ResumeActivityEntry[]
  canUndo: boolean
  onActivate: () => Promise<void>
  onApply: (data: ResumeData, response: string, changed: boolean) => void
  onUndo: () => void
}

const SUGGESTIONS = [
  "Tighten my summary without changing the meaning",
  "Make my experience bullets more measurable",
  "Tailor this resume for a product design role",
]

export function ResumeAiSidebar({
  fileName,
  resumePath,
  activityHistory,
  canUndo,
  onActivate,
  onApply,
  onUndo,
}: ResumeAiSidebarProps) {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [input, setInput] = useState("")
  const [status, setStatus] = useState<ChatStatus>("ready")
  const [error, setError] = useState("")
  const activationStartedRef = useRef(false)

  function createMessage(role: UIMessage["role"], text: string): UIMessage {
    return {
      id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      parts: [{ type: "text", text, state: "done" }],
    }
  }

  async function activateChat() {
    const wasStarted = activationStartedRef.current
    activationStartedRef.current = true
    try {
      await onActivate()
    } catch (reason) {
      if (!wasStarted) activationStartedRef.current = false
      throw reason
    }
  }

  function handleFocus() {
    if (activationStartedRef.current) return
    void activateChat().catch((reason: unknown) => {
      setError(toErrorMessage(reason, "The resume could not be checkpointed."))
    })
  }

  async function handleSubmit(message: PromptInputMessage) {
    const text = message.text.trim()
    if (!text || status === "submitted" || status === "streaming") return

    setError("")
    setStatus("submitted")

    try {
      await activateChat()
      setMessages((current) => [...current, createMessage("user", text)])
      setInput("")
      setStatus("streaming")

      const result = await runResumeAiJob(resumePath, text)
      onApply(result.data, result.response, result.changed)
      setMessages((current) => [
        ...current,
        createMessage(
          "assistant",
          result.response || (result.changed ? "I updated the resume JSON." : "I did not make any changes to the resume JSON."),
        ),
      ])
      setStatus("ready")
    } catch (reason) {
      setStatus("error")
      setError(toErrorMessage(reason, "Codex could not update this resume."))
      setMessages((current) => [
        ...current,
        createMessage("assistant", "I couldn't update the resume. Check the Codex provider status and try again."),
      ])
    }
  }

  const isBusy = status === "submitted" || status === "streaming"

  return (
    <aside className="resume-ai-sidebar" id="resume-ai-sidebar" aria-label="AI resume assistant">
      <header className="resume-ai-sidebar-header">
        <div className="resume-ai-sidebar-heading">
          <div className="resume-ai-sidebar-kicker"><Sparkles aria-hidden="true" /><span>Local assistant</span></div>
          <h2>Edit with AI</h2>
          <p>Codex works on this resume JSON on your machine.</p>
        </div>
        <Badge className="resume-ai-provider-badge" variant="outline"><Bot aria-hidden="true" /> Codex</Badge>
      </header>

      <div className="resume-ai-file-card">
        <FileJson2 aria-hidden="true" />
        <div className="min-w-0">
          <strong title={fileName}>{fileName}</strong>
          <span>Edits save directly to this file</span>
        </div>
        <Check aria-hidden="true" />
      </div>

      {activityHistory.length ? (
        <div className="resume-ai-activity" aria-label="Activity history">
          <div className="resume-ai-activity-heading">
            <span><History aria-hidden="true" /> Activity</span>
            <span>{activityHistory.length}</span>
          </div>
          <div className="resume-ai-activity-list">
            {activityHistory.slice(0, 3).map((entry) => (
              <div className="resume-ai-activity-entry" key={entry.id}>
                <span className="resume-ai-activity-dot" aria-hidden="true" />
                <div>
                  <strong>{entry.label}</strong>
                  <span>{entry.detail}</span>
                </div>
              </div>
            ))}
          </div>
          <Button
            className="resume-ai-undo-button"
            variant="outline"
            size="sm"
            onClick={onUndo}
            disabled={!canUndo || isBusy}
          >
            <RotateCcw aria-hidden="true" /> Undo last AI change
          </Button>
        </div>
      ) : null}

      <Conversation className="resume-ai-conversation">
        <ConversationContent className="resume-ai-conversation-content">
          {messages.length === 0 ? (
            <ConversationEmptyState
              className="resume-ai-empty-state"
              icon={<WandSparkles className="size-7" />}
              title="What should change?"
              description="Ask Codex to improve content, tailor the story, or clean up the JSON while preserving your resume structure."
            />
          ) : (
            messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, index) => (
                    part.type === "text" ? (
                      <MessageResponse key={`${message.id}-${index}`}>{part.text}</MessageResponse>
                    ) : null
                  ))}
                </MessageContent>
              </Message>
            ))
          )}
          {isBusy ? (
            <Message from="assistant">
              <MessageContent className="resume-ai-working-message">
                <Shimmer duration={1}>Editing your resume JSON…</Shimmer>
              </MessageContent>
            </Message>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {messages.length === 0 ? (
        <Suggestions className="resume-ai-suggestions" aria-label="Suggested prompts">
          {SUGGESTIONS.map((suggestion) => (
            <Suggestion key={suggestion} suggestion={suggestion} onClick={setInput} />
          ))}
        </Suggestions>
      ) : null}

      <div className="resume-ai-composer">
        <PromptInput onSubmit={handleSubmit} className="resume-ai-prompt">
          <PromptInputTextarea
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            onFocus={handleFocus}
            placeholder="Ask Codex to edit this resume…"
            disabled={isBusy}
            aria-label="Ask Codex to edit this resume"
          />
          <PromptInputSubmit
            status={status}
            disabled={!input.trim() || isBusy}
            className="resume-ai-submit"
          />
        </PromptInput>
        <p className="resume-ai-composer-hint">
          <CircleAlert aria-hidden="true" /> Changes are checkpointed before the first request.
        </p>
        {error ? <p className="resume-ai-error" role="alert">{error}</p> : null}
      </div>
    </aside>
  )
}

function toErrorMessage(reason: unknown, fallback: string) {
  if (typeof reason === "string" && reason.trim()) return reason
  if (reason instanceof Error && reason.message.trim()) return reason.message
  return fallback
}
