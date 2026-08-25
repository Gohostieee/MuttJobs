import { useMemo, useRef, useState } from "react"
import type { ChatStatus } from "ai"
import { CircleAlert, Sparkles } from "lucide-react"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { MessageResponse } from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import {
  AgentActivityTrace,
  DEFAULT_RESUME_AI_SELECTION,
  ModelReasoningSelector,
  type AgentActivity,
} from "@/components/resume-ai-sidebar"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { MuttJobsLogo } from "@/components/brand/muttjobs-logo"
import {
  Message as UiMessage,
  MessageContent as UiMessageContent,
} from "@/components/ui/message"
import {
  runGeneralAgentJob,
  type GeneralAgentMessage,
} from "@/lib/general-agent"
import type { ResumeAiSelection, ResumeAiStreamEvent } from "@/lib/resume-ai"

const SUGGESTIONS = [
  "Show me all of my saved jobs",
  "Get all details for a saved job",
  "Research a saved company with a model and reasoning level",
]

type ChatEntry = {
  id: string
  role: "user" | "assistant"
  text: string
  activities: AgentActivity[]
  streaming?: boolean
  error?: string
}

export function AgentWorkspace() {
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [input, setInput] = useState("")
  const [status, setStatus] = useState<ChatStatus>("ready")
  const [error, setError] = useState("")
  const [selection, setSelection] = useState<ResumeAiSelection>(DEFAULT_RESUME_AI_SELECTION)
  const nextId = useRef(0)
  const isBusy = status === "submitted" || status === "streaming"

  const transcript = useMemo<GeneralAgentMessage[]>(() => messages
    .filter((message) => message.text && !message.error)
    .map((message) => ({ role: message.role, content: message.text })), [messages])

  function createMessage(role: ChatEntry["role"], text: string, extras: Partial<ChatEntry> = {}): ChatEntry {
    nextId.current += 1
    return { id: `agent-message-${nextId.current}`, role, text, activities: [], ...extras }
  }

  function handleEvent(assistantId: string, event: ResumeAiStreamEvent) {
    if (event.type === "progress" || event.type === "thread" || event.type === "usage") return
    setStatus("streaming")
    setMessages((current) => current.map((message) => {
      if (message.id !== assistantId) return message
      const activity: AgentActivity = {
        id: event.id,
        kind: event.kind,
        status: event.status,
        eventType: event.eventType,
        item: event.item,
      }
      const existing = message.activities.findIndex((candidate) => candidate.id === activity.id)
      return {
        ...message,
        activities: existing === -1
          ? [...message.activities, activity]
          : message.activities.map((candidate, index) => index === existing ? activity : candidate),
      }
    }))
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isBusy) return
    const userMessage = createMessage("user", trimmed)
    const assistantMessage = createMessage("assistant", "", { streaming: true })
    const nextTranscript = [...transcript, { role: "user" as const, content: trimmed }]
    setMessages((current) => [...current, userMessage, assistantMessage])
    setInput("")
    setError("")
    setStatus("submitted")

    try {
      const result = await runGeneralAgentJob(
        nextTranscript,
        selection,
        (event) => handleEvent(assistantMessage.id, event),
      )
      setMessages((current) => current.map((message) => message.id === assistantMessage.id
        ? { ...message, text: result.response, streaming: false }
        : message))
      setStatus("ready")
    } catch (reason) {
      const message = toErrorMessage(reason)
      setMessages((current) => current.map((entry) => entry.id === assistantMessage.id
        ? { ...entry, streaming: false, error: message, text: "I couldn't finish that application workflow." }
        : entry))
      setError(message)
      setStatus("error")
    }
  }

  function handleSubmit(message: PromptInputMessage) {
    void send(message.text)
  }

  return (
    <main className="agent-workspace">
      <header className="agent-workspace-header">
        <div className="agent-workspace-title">
          <MuttJobsLogo className="agent-workspace-mark" markClassName="size-full" />
          <div>
            <p>Workflow orchestration</p>
            <h1>MuttJobs Agent</h1>
          </div>
        </div>
        <p className="agent-workspace-capabilities">
          Use trusted MuttJobs tools to inspect saved jobs and run Company Research.
        </p>
      </header>

      <Conversation className="resume-ai-conversation agent-workspace-conversation">
        <ConversationContent className="resume-ai-conversation-content agent-workspace-conversation-content">
          {messages.length === 0 ? (
            <ConversationEmptyState
              className="resume-ai-empty-state agent-workspace-empty"
              icon={<Sparkles className="size-5" />}
              title="Run MuttJobs workflows from one chat."
              description="Ask for saved-job details or start Company Research. Research requests must name the model and reasoning level to use."
            />
          ) : messages.map((message) => (
            <UiMessage
              align={message.role === "user" ? "end" : "start"}
              className={`resume-ai-message ${message.role === "user" ? "resume-ai-message-user" : "resume-ai-message-assistant"}`}
              key={message.id}
            >
              <UiMessageContent className="resume-ai-message-content">
                <Bubble
                  align={message.role === "user" ? "end" : "start"}
                  className="resume-ai-message-bubble"
                  variant={message.role === "user" ? "secondary" : "ghost"}
                >
                  <BubbleContent className="resume-ai-bubble-content">
                    {message.role === "assistant" && message.activities.length ? (
                      <AgentActivityTrace activities={message.activities} isStreaming={Boolean(message.streaming)} />
                    ) : null}
                    {message.text ? <MessageResponse className="resume-ai-message-response">{message.text}</MessageResponse> : null}
                    {message.streaming ? (
                      <div className="resume-ai-working-message" role="status" aria-live="polite">
                        <span className="resume-ai-working-dots" aria-hidden="true"><i /><i /><i /></span>
                        <span>{message.activities.length ? "Working through the application…" : "Reading your workspace…"}</span>
                      </div>
                    ) : null}
                    {message.error ? <p className="resume-ai-error">{message.error}</p> : null}
                  </BubbleContent>
                </Bubble>
              </UiMessageContent>
            </UiMessage>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {messages.length === 0 ? (
        <Suggestions className="resume-ai-suggestions agent-workspace-suggestions" aria-label="Suggested application workflows">
          {SUGGESTIONS.map((suggestion) => (
            <Suggestion key={suggestion} suggestion={suggestion} onClick={setInput} />
          ))}
        </Suggestions>
      ) : null}

      <div className="resume-ai-composer agent-workspace-composer">
        <PromptInput onSubmit={handleSubmit} className="resume-ai-prompt">
          <PromptInputTextarea
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder="Ask about saved jobs or research a company…"
            disabled={isBusy}
            aria-label="Message the MuttJobs application agent"
          />
          <PromptInputFooter className="resume-ai-prompt-footer">
            <div className="resume-ai-prompt-options">
              <ModelReasoningSelector disabled={isBusy} iconOnly value={selection} onChange={setSelection} />
            </div>
            <PromptInputSubmit status={status} disabled={!input.trim() || isBusy} className="resume-ai-submit" />
          </PromptInputFooter>
        </PromptInput>
        <p className="resume-ai-composer-hint">
          <CircleAlert aria-hidden="true" /> Company Research only runs for saved jobs and requires an explicit model and reasoning level.
        </p>
        {error ? <p className="resume-ai-error" role="alert">{error}</p> : null}
      </div>
    </main>
  )
}

function toErrorMessage(reason: unknown) {
  if (typeof reason === "string" && reason.trim()) return reason
  if (reason instanceof Error && reason.message.trim()) return reason.message
  return "The general agent could not complete this request."
}
