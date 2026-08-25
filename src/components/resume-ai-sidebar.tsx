import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentProps, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type SyntheticEvent } from "react"
import type { ChatStatus } from "ai"
import type { StickToBottomContext } from "use-stick-to-bottom"
import {
  Brain,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  CircleX,
  FilePenLine,
  FileText,
  Globe2,
  ListTodo,
  LoaderCircle,
  PanelLeftClose,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Terminal,
  Wrench,
  WandSparkles,
  X,
} from "lucide-react"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { MessageResponse } from "@/components/ai-elements/message"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import { Button } from "@/components/ui/button"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Message as UiMessage,
  MessageContent as UiMessageContent,
} from "@/components/ui/message"
import {
  runResumeAiJob,
  type ResumeAiJobOptions,
  type ResumeAiItem,
  type ResumeAiSelection,
  type ResumeAiStreamEvent,
} from "@/lib/resume-ai"
import { formatAgentMessage } from "@/lib/agent-message"
import { ContextWindowMeter } from "@/components/context-window-meter"
import { deriveLatestContextWindowSnapshot } from "@/lib/context-window"
import {
  getAgentSkillMentionAtCaret,
  loadAgentSkillCatalog,
  parseAgentSkillMentions,
  resolveAgentSkillNames,
  type AgentSkill,
  type AgentSkillCatalog,
  type AgentSkillMentionContext,
} from "@/lib/agent-skills"
import type { ResumeData } from "@/lib/resume-types"
import { loadResumes } from "@/lib/resume-storage"
import type { ResumeFile } from "@/lib/resume-types"
import {
  RESUME_SELECTION_ACTIONS,
  type ResumeSelectionAction,
  type ResumeTextSelection,
} from "@/lib/resume-selection"
import {
  AGENT_MODEL_PROVIDERS,
  ALL_AGENT_MODELS,
  CLAUDE_MODELS,
  CODEX_MODELS,
  CODEX_REASONING_LEVELS,
  DEFAULT_CODEX_MODEL_ID,
  type AgentModel,
  type AgentModelProvider,
} from "@/lib/agent-models"
import { listSavedTheirStackJobs, type TheirStackJob } from "@/lib/theirstack"

type DocumentAiRunner<T> = (
  path: string,
  prompt: string,
  selection?: ResumeAiSelection,
  options?: ResumeAiJobOptions,
) => Promise<{ data: T; response: string; changed: boolean }>

type ResumeAiSidebarProps<T> = {
  resumePath: string
  documentLabel?: string
  suggestions?: string[]
  runJob?: DocumentAiRunner<T>
  isOpen: boolean
  onToggle: () => void
  onActivate: () => Promise<void>
  onApply: (data: T, changed: boolean) => void
  textSelection?: ResumeTextSelection | null
  selectionActionRequest?: {
    id: number
    action: ResumeSelectionAction
    selection: ResumeTextSelection
  } | null
  onClearTextSelection?: () => void
  enableJobTargeting?: boolean
  enableResumeTargeting?: boolean
  targetJobId?: number
}

const SUGGESTIONS = [
  "Tighten my summary without changing the meaning",
  "Make my experience bullets more measurable",
  "Tailor this resume for a product design role",
]

type ResumeAiActivity = {
  id: string
  kind: string
  status: string
  eventType: string
  item: ResumeAiItem | null
}

export type AgentActivity = ResumeAiActivity

type ResumeAiChatEntry = {
  id: string
  role: "user" | "assistant"
  text: string
  activities: ResumeAiActivity[]
  streaming?: boolean
  error?: string
  usage?: Record<string, unknown>
  model?: {
    provider: string
    name: string
    effort: string
  }
}

export function ResumeAiSidebar<T = ResumeData>({
  resumePath,
  documentLabel = "resume",
  suggestions = SUGGESTIONS,
  runJob = runResumeAiJob as unknown as DocumentAiRunner<T>,
  isOpen,
  onToggle,
  onActivate,
  onApply,
  textSelection = null,
  selectionActionRequest = null,
  onClearTextSelection,
  enableJobTargeting = false,
  enableResumeTargeting = false,
  targetJobId,
}: ResumeAiSidebarProps<T>) {
  const [messages, setMessages] = useState<ResumeAiChatEntry[]>([])
  const [input, setInput] = useState("")
  const [status, setStatus] = useState<ChatStatus>("ready")
  const [error, setError] = useState("")
  const [selection, setSelection] = useState<ResumeAiSelection>(DEFAULT_RESUME_AI_SELECTION)
  const [skillCatalog, setSkillCatalog] = useState<AgentSkillCatalog>({ skills: [], errors: [] })
  const [skillCatalogLoading, setSkillCatalogLoading] = useState(false)
  const [skillPickerOpen, setSkillPickerOpen] = useState(false)
  const [skillPickerIndex, setSkillPickerIndex] = useState(0)
  const [caretPosition, setCaretPosition] = useState(0)
  const [savedJobs, setSavedJobs] = useState<TheirStackJob[]>([])
  const [savedJobsLoading, setSavedJobsLoading] = useState(false)
  const [savedJobsError, setSavedJobsError] = useState("")
  const [targetJob, setTargetJob] = useState<TheirStackJob | null>(null)
  const [savedResumes, setSavedResumes] = useState<ResumeFile[]>([])
  const [savedResumesLoading, setSavedResumesLoading] = useState(false)
  const [savedResumesError, setSavedResumesError] = useState("")
  const [targetResume, setTargetResume] = useState<ResumeFile | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const conversationRef = useRef<StickToBottomContext | null>(null)
  const activationStartedRef = useRef(false)
  const lastSelectionActionRef = useRef(0)

  const selectedProvider = MODEL_PROVIDERS.find((provider) => provider.id === selection.provider) ?? MODEL_PROVIDERS[0]
  const skillMentionContext = getAgentSkillMentionAtCaret(input, caretPosition)
  const visibleSkills = skillMentionContext
    ? skillCatalog.skills
      .filter((skill) => {
        const needle = skillMentionContext.query.toLowerCase()
        return `${skill.name} ${skill.description}`.toLowerCase().includes(needle)
      })
      .slice(0, 8)
    : []
  const activeContext = useMemo(() => {
    if (selection.provider !== "codex") return null
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message.role !== "assistant") continue
      const usage = deriveLatestContextWindowSnapshot([message.usage])
      if (usage) {
        return { usage, provider: message.model?.provider ?? null }
      }
    }
    return null
  }, [messages, selection.provider])
  const jobPrimaryResume = targetJob?.primaryResume ?? null

  const refreshSavedJobs = useCallback(async () => {
    setSavedJobsLoading(true)
    setSavedJobsError("")
    try {
      const jobs = await listSavedTheirStackJobs()
      setSavedJobs(jobs)
      if (targetJobId !== undefined) {
        setTargetJob(jobs.find((job) => job.id === targetJobId) ?? null)
      }
    } catch (reason) {
      setSavedJobsError(toErrorMessage(reason, "Saved jobs could not be loaded."))
    } finally {
      setSavedJobsLoading(false)
    }
  }, [targetJobId])

  const refreshSavedResumes = useCallback(async () => {
    setSavedResumesLoading(true)
    setSavedResumesError("")
    try {
      const resumes = await loadResumes()
      setSavedResumes(resumes)
      setTargetResume((current) => current
        ? resumes.find((resume) => resume.id === current.id) ?? null
        : null)
    } catch (reason) {
      setSavedResumesError(toErrorMessage(reason, "Resumes could not be loaded."))
    } finally {
      setSavedResumesLoading(false)
    }
  }, [])

  const refreshSkillCatalog = useCallback(async () => {
    setSkillCatalogLoading(true)
    try {
      const catalog = await loadAgentSkillCatalog()
      setSkillCatalog(catalog)
      return catalog
    } finally {
      setSkillCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen || selection.provider !== "codex") {
      setSkillPickerOpen(false)
      return
    }
    void refreshSkillCatalog().catch(() => {
      // A catalog failure should not disable ordinary resume chat.
    })
  }, [isOpen, refreshSkillCatalog, selection.provider])

  useEffect(() => {
    if (!enableJobTargeting || !isOpen) return
    void refreshSavedJobs()
  }, [enableJobTargeting, isOpen, refreshSavedJobs])

  useEffect(() => {
    if (!enableResumeTargeting || !isOpen) return
    void refreshSavedResumes()
  }, [enableResumeTargeting, isOpen, refreshSavedResumes])

  function createMessage(
    role: ResumeAiChatEntry["role"],
    text: string,
    options?: Partial<Pick<ResumeAiChatEntry, "streaming" | "model">>,
  ): ResumeAiChatEntry {
    return {
      id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      text,
      activities: [],
      ...options,
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
      setError(toErrorMessage(reason, `The ${documentLabel} could not be checkpointed.`))
    })
  }

  function updateSkillPicker(value: string, caret: number) {
    setCaretPosition(caret)
    const context = getAgentSkillMentionAtCaret(value, caret)
    setSkillPickerOpen(selection.provider === "codex" && context !== null)
    setSkillPickerIndex(0)
  }

  function handlePromptChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.currentTarget.value
    setInput(value)
    updateSkillPicker(value, event.currentTarget.selectionStart ?? value.length)
  }

  function handlePromptCaretChange(event: SyntheticEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget
    textareaRef.current = textarea
    updateSkillPicker(textarea.value, textarea.selectionStart ?? textarea.value.length)
  }

  function insertSkill(skill: AgentSkill, context: AgentSkillMentionContext) {
    const replacement = `#(${skill.name})`
    const nextInput = `${input.slice(0, context.start)}${replacement}${input.slice(context.end)}`
    const nextCaret = context.start + replacement.length
    setInput(nextInput)
    setCaretPosition(nextCaret)
    setSkillPickerOpen(false)
    setSkillPickerIndex(0)
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current
      textarea?.focus()
      textarea?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  function handlePromptKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    textareaRef.current = event.currentTarget
    const context = getAgentSkillMentionAtCaret(
      event.currentTarget.value,
      event.currentTarget.selectionStart ?? event.currentTarget.value.length,
    )
    if (!skillPickerOpen || !context || !visibleSkills.length || selection.provider !== "codex") {
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      setSkillPickerOpen(false)
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      setSkillPickerIndex((current) => Math.min(current + 1, visibleSkills.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setSkillPickerIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault()
      insertSkill(visibleSkills[skillPickerIndex] ?? visibleSkills[0], context)
    }
  }

  async function resolveSubmittedSkills(text: string) {
    const mentions = parseAgentSkillMentions(text)
    if (!mentions.length) return []
    if (selection.provider !== "codex") {
      throw new Error("Local Codex skills require the Codex provider.")
    }

    try {
      return resolveAgentSkillNames(mentions, skillCatalog)
    } catch (reason) {
      if (!(reason instanceof Error) || !reason.message.startsWith("Local skill `")) throw reason
      const refreshed = await refreshSkillCatalog()
      return resolveAgentSkillNames(mentions, refreshed)
    }
  }

  async function submitPrompt(
    requestedText: string,
    scopedSelection: ResumeTextSelection | null = textSelection,
    scopedAction: ResumeSelectionAction | undefined = scopedSelection ? "custom" : undefined,
  ) {
    const text = requestedText.trim()
    if (!text || status === "submitted" || status === "streaming") return

    setError("")

    let skillNames: string[]
    try {
      skillNames = await resolveSubmittedSkills(text)
    } catch (reason) {
      setStatus("ready")
      setError(toErrorMessage(reason, "The local skill mention could not be validated."))
      return
    }

    setStatus("submitted")

    let assistantId = ""

    try {
      await activateChat()
      const userMessage = createMessage("user", text)
      const assistantMessage = createMessage("assistant", "", {
        streaming: true,
        model: {
          provider: selectedProvider.name,
          name: modelNameForSelection(selection),
          effort: formatEffort(selection.effort),
        },
      })
      assistantId = assistantMessage.id
      setMessages((current) => [...current, userMessage, assistantMessage])
      setInput("")
      setStatus("streaming")

      const result = await runJob(resumePath, text, selection, {
        skillNames,
        targetJobId: targetJobId ?? (enableJobTargeting ? targetJob?.id : undefined),
        targetResumeId: enableResumeTargeting ? targetResume?.id : undefined,
        textSelection: scopedSelection ?? undefined,
        selectionAction: scopedAction,
        onEvent: (event) => {
          setStatus("streaming")
          setMessages((current) => updateAssistantEntry(current, assistantId, event))
        },
      })
      onApply(result.data, result.changed)
      const response = result.response || (result.changed ? `I updated the ${documentLabel} JSON.` : `I did not make any changes to the ${documentLabel} JSON.`)
      setMessages((current) => current.map((entry) => (
        entry.id === assistantId
          ? { ...entry, text: response, streaming: false }
          : entry
      )))
      setStatus("ready")
    } catch (reason) {
      if (reason instanceof Error && reason.message.startsWith("Local skill `")) {
        void refreshSkillCatalog().catch(() => {})
      }
      setStatus("error")
      const message = toErrorMessage(reason, `${selectedProvider.name} could not update this ${documentLabel}.`)
      setError(message)
      setMessages((current) => assistantId
        ? current.map((entry) => entry.id === assistantId
          ? {
              ...entry,
              text: `I couldn't update the ${documentLabel}. Check the ${selectedProvider.name} provider status and try again.`,
              streaming: false,
              error: message,
            }
          : entry)
        : [...current, createMessage("assistant", `I couldn't update the ${documentLabel}. Check the ${selectedProvider.name} provider status and try again.`)])
    }
  }

  async function handleSubmit(message: PromptInputMessage) {
    await submitPrompt(message.text, textSelection, textSelection ? "custom" : undefined)
  }

  useEffect(() => {
    const request = selectionActionRequest
    if (!request || request.id === lastSelectionActionRef.current) return
    lastSelectionActionRef.current = request.id

    if (request.action === "custom") {
      setError("")
      window.setTimeout(() => textareaRef.current?.focus(), 0)
      return
    }

    const definition = RESUME_SELECTION_ACTIONS.find((candidate) => candidate.id === request.action)
    if (!definition?.prompt) return
    void submitPrompt(definition.prompt, request.selection, request.action)
  }, [selectionActionRequest])

  const isBusy = status === "submitted" || status === "streaming"

  useEffect(() => {
    if (!messages.some((message) => message.streaming)) return

    const frame = window.requestAnimationFrame(() => {
      const conversation = conversationRef.current
      if (!conversation || conversation.escapedFromLock) return

      // Tool output can make a turn substantially taller in one render. Keep
      // following it unless the user has deliberately scrolled away.
      void conversation.scrollToBottom({ animation: "instant" })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [messages])

  function handleToggle() {
    if (isOpen && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    onToggle()
  }

  return (
    <aside
      className={`resume-ai-sidebar ${isOpen ? "" : "is-collapsed"}`.trim()}
      id="resume-ai-sidebar"
      aria-hidden={!isOpen}
      aria-label={`AI ${documentLabel} assistant`}
    >
      <header className="resume-ai-sidebar-header">
        <div className="resume-ai-sidebar-heading">
          <ProviderMark provider={selectedProvider.id} aria-hidden="true" />
          <h2>Edit with AI</h2>
          <span className="resume-ai-sidebar-provider">{selectedProvider.name}</span>
        </div>
        <div className="resume-ai-sidebar-header-actions">
          <Button
            variant="ghost"
            size="icon-sm"
            className="resume-ai-collapse-button"
            onClick={handleToggle}
            aria-label="Collapse AI assistant"
            aria-controls="resume-ai-sidebar"
            aria-expanded={isOpen}
            title="Collapse AI assistant"
          >
            <PanelLeftClose aria-hidden="true" />
          </Button>
        </div>
      </header>

      <Conversation className="resume-ai-conversation" contextRef={conversationRef}>
        <ConversationContent className="resume-ai-conversation-content">
          {messages.length === 0 ? (
            <ConversationEmptyState
              className="resume-ai-empty-state"
              icon={<WandSparkles className="size-5" />}
              title="Send a message to start editing."
              description={`Ask ${selectedProvider.name} to improve, tailor, or clean up this ${documentLabel}.`}
            />
          ) : (
            messages.map((message) => (
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
                        <ResumeAiTrace
                          activities={message.activities}
                          isStreaming={Boolean(message.streaming)}
                        />
                      ) : null}
                      {message.text ? <MessageResponse className="resume-ai-message-response">{message.text}</MessageResponse> : null}
                      {message.role === "assistant" && message.streaming ? (
                        <div className="resume-ai-working-message" role="status" aria-live="polite">
                          <span className="resume-ai-working-dots" aria-hidden="true"><i /><i /><i /></span>
                          <span>{message.activities.length ? "Working through the request…" : `Editing your ${documentLabel} JSON…`}</span>
                        </div>
                      ) : null}
                      {message.role === "assistant" && message.model ? (
                        <ResumeAiTurnMeta model={message.model} usage={message.usage} />
                      ) : null}
                    </BubbleContent>
                  </Bubble>
                </UiMessageContent>
              </UiMessage>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {messages.length === 0 ? (
        <Suggestions className="resume-ai-suggestions" aria-label="Suggested prompts">
          {suggestions.map((suggestion) => (
            <Suggestion key={suggestion} suggestion={suggestion} onClick={setInput} />
          ))}
        </Suggestions>
      ) : null}

      <div className="resume-ai-composer">
        {textSelection ? (
          <div className="resume-ai-selection-context" role="status" aria-label={`Selected ${documentLabel} text attached to this request`}>
            <div className="resume-ai-selection-context-copy">
              <Sparkles aria-hidden="true" />
              <span className="resume-ai-selection-context-label">Selected text</span>
              <span className="resume-ai-selection-context-value" title={textSelection.selectedText}>{textSelection.selectedText}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onClearTextSelection}
              aria-label="Remove selected text from request"
              title="Remove selected text"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        {enableResumeTargeting && targetResume ? (
          <div className="resume-ai-job-context resume-ai-resume-context" role="status" aria-label={`Using ${resumeDisplayName(targetResume)} as resume context`}>
            <div className="resume-ai-job-context-copy resume-ai-resume-context-copy">
              <FileText aria-hidden="true" />
              <span className="resume-ai-job-context-label">Resume context</span>
              <span className="resume-ai-job-context-value" title={`${resumeDisplayName(targetResume)} · ${targetResume.fileName}`}>
                {resumeDisplayName(targetResume)} <span>· {targetResume.fileName}</span>
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setTargetResume(null)}
              aria-label="Remove resume context from request"
              title="Remove resume context"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        {enableResumeTargeting && !targetResume && jobPrimaryResume ? (
          <div className="resume-ai-job-context resume-ai-resume-context" role="status" aria-label={`Using the job primary resume, ${jobPrimaryResume.sourceFileName}, as resume context`}>
            <div className="resume-ai-job-context-copy resume-ai-resume-context-copy">
              <FileText aria-hidden="true" />
              <span className="resume-ai-job-context-label">Resume context</span>
              <span className="resume-ai-job-context-value" title={`Job primary resume · ${jobPrimaryResume.sourceFileName}`}>
                Job primary resume <span>· {jobPrimaryResume.sourceFileName}</span>
              </span>
            </div>
          </div>
        ) : null}
        {enableJobTargeting && targetJob ? (
          <div className="resume-ai-job-context" role="status" aria-label={`Targeting ${targetJob.jobTitle}`}>
            <div className="resume-ai-job-context-copy">
              <BriefcaseBusiness aria-hidden="true" />
              <span className="resume-ai-job-context-label">Targeting</span>
              <span className="resume-ai-job-context-value" title={`${targetJob.jobTitle} at ${targetJob.company || "Company not provided"}`}>
                {targetJob.jobTitle} <span>· {targetJob.company || "Company not provided"}</span>
              </span>
            </div>
            {targetJobId === undefined ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setTargetJob(null)}
                aria-label="Remove target job from request"
                title="Remove target job"
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ) : null}
        {skillPickerOpen && selection.provider === "codex" && skillMentionContext ? (
          <div className="resume-ai-skill-picker" role="listbox" aria-label="Local Codex skills">
            <div className="resume-ai-skill-picker-header">
              <span>Local Codex skills</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => { void refreshSkillCatalog() }}
                aria-label="Refresh local skills"
                title={skillCatalog.errors.length ? `${skillCatalog.errors.length} skill catalog error(s)` : "Refresh local skills"}
                disabled={skillCatalogLoading}
              >
                <RefreshCw className={skillCatalogLoading ? "animate-spin" : ""} aria-hidden="true" />
              </Button>
            </div>
            {visibleSkills.length ? visibleSkills.map((skill, index) => (
              <Button
                type="button"
                variant="ghost"
                className={`resume-ai-skill-option ${index === skillPickerIndex ? "is-active" : ""}`.trim()}
                key={`${skill.name}-${skill.path}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertSkill(skill, skillMentionContext)}
                role="option"
                aria-selected={index === skillPickerIndex}
              >
                <span className="resume-ai-skill-option-name">#({skill.name})</span>
                <span className="resume-ai-skill-option-description">{skill.description}</span>
              </Button>
            )) : (
              <div className="resume-ai-skill-picker-empty">
                {skillCatalogLoading ? "Loading local skills..." : "No matching local skills."}
              </div>
            )}
          </div>
        ) : null}
        <PromptInput onSubmit={handleSubmit} className="resume-ai-prompt">
          <PromptInputTextarea
            value={input}
            onChange={handlePromptChange}
            onFocus={(event) => {
              textareaRef.current = event.currentTarget
              handleFocus()
              updateSkillPicker(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length)
            }}
            onSelect={handlePromptCaretChange}
            onKeyDown={handlePromptKeyDown}
            placeholder={`Ask ${selectedProvider.name} to edit this ${documentLabel}…`}
            disabled={isBusy}
            aria-label={`Ask ${selectedProvider.name} to edit this ${documentLabel}`}
          />
          <PromptInputFooter className="resume-ai-prompt-footer">
            {activeContext ? (
              <ContextWindowMeter
                usage={activeContext.usage}
                providerDisplayName={activeContext.provider}
              />
            ) : null}
            <div className="resume-ai-prompt-options">
              {enableResumeTargeting ? (
                <ResumeTargetSelector
                  disabled={isBusy}
                  value={targetResume}
                  resumes={savedResumes}
                  loading={savedResumesLoading}
                  error={savedResumesError}
                  onRefresh={() => { void refreshSavedResumes() }}
                  onChange={setTargetResume}
                />
              ) : null}
              {enableJobTargeting ? (
                <JobTargetSelector
                  disabled={isBusy || targetJobId !== undefined}
                  locked={targetJobId !== undefined}
                  value={targetJob}
                  jobs={savedJobs}
                  loading={savedJobsLoading}
                  error={savedJobsError}
                  onRefresh={() => { void refreshSavedJobs() }}
                  onChange={setTargetJob}
                />
              ) : null}
              <ModelReasoningSelector
                disabled={isBusy}
                iconOnly
                value={selection}
                onChange={setSelection}
              />
            </div>
            <PromptInputSubmit
              status={status}
              disabled={!input.trim() || isBusy}
              className="resume-ai-submit"
            />
          </PromptInputFooter>
        </PromptInput>
        <p className="resume-ai-composer-hint">
          <CircleAlert aria-hidden="true" /> Changes are checkpointed before the first request.
        </p>
        {error ? <p className="resume-ai-error" role="alert">{error}</p> : null}
      </div>
    </aside>
  )
}

function updateAssistantEntry(
  entries: ResumeAiChatEntry[],
  assistantId: string,
  event: ResumeAiStreamEvent,
) {
  return entries.map((entry) => {
    if (entry.id !== assistantId || entry.role !== "assistant") return entry

    if (event.type === "item") {
      const nextActivity: ResumeAiActivity = {
        id: event.id,
        kind: event.kind,
        status: event.status,
        eventType: event.eventType,
        item: event.item,
      }
      const existingIndex = entry.activities.findIndex((activity) => activity.id === event.id)
      const activities = existingIndex === -1
        ? [...entry.activities, nextActivity]
        : entry.activities.map((activity, index) => index === existingIndex ? nextActivity : activity)
      return { ...entry, activities }
    }

    if (event.type === "usage") return { ...entry, usage: event.usage }
    return entry
  })
}

function ResumeAiTrace({
  activities,
  isStreaming,
}: {
  activities: ResumeAiActivity[]
  isStreaming: boolean
}) {
  return (
    <div className="resume-ai-trace" aria-label="Agent activity">
      {activities.map((activity) => (
        <ResumeAiActivityRow
          activity={activity}
          isStreaming={isStreaming}
          key={activity.id}
        />
      ))}
    </div>
  )
}

export function AgentActivityTrace({
  activities,
  isStreaming,
}: {
  activities: AgentActivity[]
  isStreaming: boolean
}) {
  return <ResumeAiTrace activities={activities} isStreaming={isStreaming} />
}

function ResumeAiActivityRow({
  activity,
  isStreaming,
}: {
  activity: ResumeAiActivity
  isStreaming: boolean
}) {
  const item = activity.item
  const kind = asString(item, "type") || activity.kind

  if (kind === "reasoning") {
    return <ResumeAiReasoningBlock activity={activity} isStreaming={isStreaming} />
  }
  if (kind === "todo_list") {
    return <ResumeAiTodoBlock activity={activity} />
  }
  if (kind === "agent_message") {
    return <ResumeAiAgentMessageBlock activity={activity} />
  }
  return <ResumeAiToolBlock activity={activity} />
}

function ResumeAiReasoningBlock({
  activity,
  isStreaming,
}: {
  activity: ResumeAiActivity
  isStreaming: boolean
}) {
  const text = asString(activity.item, "text") || asString(activity.item, "summary") || ""
  const active = isStreaming && activity.status === "running"
  if (!text) {
    return <TraceStatusRow icon={<Brain aria-hidden="true" />} label="Reasoning" status={activity.status} />
  }

  return (
    <Reasoning className="resume-ai-reasoning" isStreaming={active} defaultOpen={active}>
      <ReasoningTrigger
        getThinkingMessage={(streaming, duration) => (
          <span>{streaming ? "Thinking…" : duration ? `Thought for ${duration}s` : "Reasoning"}</span>
        )}
      />
      <ReasoningContent>{text}</ReasoningContent>
    </Reasoning>
  )
}

function ResumeAiToolBlock({ activity }: { activity: ResumeAiActivity }) {
  const item = activity.item
  const kind = asString(item, "type") || activity.kind
  const title = toolTitle(item, kind)
  const preview = toolPreview(item, kind)
  const details = toolDetails(item, kind)
  const Icon = toolIcon(kind)

  return (
    <details className="resume-ai-tool" open={activity.status === "running"}>
      <summary>
        <ChevronRight className="resume-ai-tool-chevron" aria-hidden="true" />
        <span className="resume-ai-tool-icon"><Icon aria-hidden="true" /></span>
        <span className="resume-ai-tool-title">{title}</span>
        {preview ? <span className="resume-ai-tool-preview">{preview}</span> : null}
        <TraceStatus status={activity.status} />
      </summary>
      <div className="resume-ai-tool-details">
        {details.map((detail) => (
          <TraceDataBlock key={detail.label} label={detail.label} value={detail.value} />
        ))}
        {!details.length ? <TraceDataBlock label="Event" value={formatPayload(item)} /> : null}
      </div>
    </details>
  )
}

function ResumeAiTodoBlock({ activity }: { activity: ResumeAiActivity }) {
  const items = Array.isArray(activity.item?.items) ? activity.item.items : []
  return (
    <details className="resume-ai-tool" open={activity.status === "running"}>
      <summary>
        <ChevronRight className="resume-ai-tool-chevron" aria-hidden="true" />
        <span className="resume-ai-tool-icon"><ListTodo aria-hidden="true" /></span>
        <span className="resume-ai-tool-title">Plan</span>
        <span className="resume-ai-tool-preview">{items.length} steps</span>
        <TraceStatus status={activity.status} />
      </summary>
      <div className="resume-ai-tool-details resume-ai-plan-details">
        {items.map((value, index) => {
          const step = asRecord(value)
          const complete = step?.completed === true
          return (
            <div className={`resume-ai-plan-step ${complete ? "is-complete" : ""}`.trim()} key={`${index}-${String(step?.text ?? "step")}`}>
              {complete ? <Check aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
              <span>{typeof step?.text === "string" ? step.text : formatPayload(value)}</span>
            </div>
          )
        })}
      </div>
    </details>
  )
}

function ResumeAiAgentMessageBlock({ activity }: { activity: ResumeAiActivity }) {
  const rawText = asString(activity.item, "text")
  const text = rawText ? formatAgentMessage(rawText) : null
  if (!text) return null
  return <MessageResponse className="resume-ai-message-response">{text}</MessageResponse>
}

function ResumeAiTurnMeta({
  model,
  usage,
}: {
  model: NonNullable<ResumeAiChatEntry["model"]>
  usage?: Record<string, unknown>
}) {
  const inputTokens = asNumber(usage, "input_tokens")
  const outputTokens = asNumber(usage, "output_tokens")
  const reasoningTokens = asNumber(usage, "reasoning_output_tokens")
  const tokenLabel = inputTokens !== undefined || outputTokens !== undefined
    ? `${formatNumber((inputTokens ?? 0) + (outputTokens ?? 0))} tokens`
    : null
  return (
    <div className="resume-ai-turn-meta" aria-label="Run details">
      <span>{model.provider}</span>
      <span>{model.name}</span>
      <span>{model.effort}</span>
      {tokenLabel ? <span>{tokenLabel}</span> : null}
      {reasoningTokens !== undefined ? <span>{formatNumber(reasoningTokens)} reasoning</span> : null}
    </div>
  )
}

function TraceDataBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="resume-ai-trace-data">
      <p>{label}</p>
      <pre>{value}</pre>
    </div>
  )
}

function TraceStatusRow({
  icon,
  label,
  status,
}: {
  icon: ReactNode
  label: string
  status: string
}) {
  return (
    <div className="resume-ai-trace-status-row">
      <span className="resume-ai-tool-icon">{icon}</span>
      <span>{label}</span>
      <TraceStatus status={status} />
    </div>
  )
}

function TraceStatus({ status }: { status: string }) {
  if (status === "failed") return <span className="resume-ai-trace-status is-failed"><CircleX aria-hidden="true" /> Failed</span>
  if (status === "completed") return <span className="resume-ai-trace-status is-complete"><Check aria-hidden="true" /> Done</span>
  return <span className="resume-ai-trace-status is-running"><LoaderCircle aria-hidden="true" /> Running</span>
}

function toolTitle(item: ResumeAiItem | null, kind: string) {
  if (kind === "command_execution") return "Run command"
  if (kind === "file_change") return "Update files"
  if (kind === "mcp_tool_call") return asString(item, "tool") || "MCP tool"
  if (kind === "web_search") return "Web search"
  if (kind === "image_view") return "View image"
  if (kind === "error") return "Agent error"
  return asString(item, "name") || asString(item, "title") || humanize(kind)
}

function toolPreview(item: ResumeAiItem | null, kind: string) {
  if (kind === "command_execution") return asString(item, "command")
  if (kind === "mcp_tool_call") return asString(item, "server")
  if (kind === "web_search") return asString(item, "query")
  if (kind === "file_change") {
    const changes = Array.isArray(item?.changes) ? item.changes : []
    return changes.length ? `${changes.length} file${changes.length === 1 ? "" : "s"}` : null
  }
  return asString(item, "message") || null
}

function toolDetails(item: ResumeAiItem | null, kind: string) {
  const details: Array<{ label: string; value: string }> = []
  if (!item) return details
  if (kind === "command_execution" && asString(item, "command")) {
    details.push({ label: "Command", value: asString(item, "command")! })
  }
  if (kind === "command_execution" && asString(item, "aggregated_output")) {
    details.push({ label: "Output", value: asString(item, "aggregated_output")! })
  }
  if (kind === "command_execution" && item.exit_code !== undefined) {
    details.push({ label: "Exit code", value: String(item.exit_code) })
  }
  if (kind === "mcp_tool_call") {
    if (asString(item, "server")) details.push({ label: "Server", value: asString(item, "server")! })
    if (asString(item, "tool")) details.push({ label: "Tool", value: asString(item, "tool")! })
    if (item.arguments !== undefined) details.push({ label: "Arguments", value: formatPayload(item.arguments) })
    if (item.result !== undefined) details.push({ label: "Result", value: formatPayload(item.result) })
    if (item.error !== undefined) details.push({ label: "Error", value: formatPayload(item.error) })
  }
  if (kind === "file_change" && item.changes !== undefined) {
    details.push({ label: "Changes", value: formatPayload(item.changes) })
  }
  if (kind === "web_search" && asString(item, "query")) {
    details.push({ label: "Query", value: asString(item, "query")! })
  }
  if (kind === "error" && asString(item, "message")) {
    details.push({ label: "Message", value: asString(item, "message")! })
  }
  return details
}

function toolIcon(kind: string) {
  if (kind === "command_execution") return Terminal
  if (kind === "file_change") return FilePenLine
  if (kind === "web_search") return Globe2
  if (kind === "mcp_tool_call" || kind === "dynamic_tool_call") return Wrench
  return Brain
}

function asString(value: unknown, key?: string) {
  const candidate = key && asRecord(value)?.[key]
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined
}

function asNumber(value: unknown, key: string) {
  const candidate = asRecord(value)?.[key]
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function formatPayload(value: unknown) {
  if (typeof value === "string") return value
  if (value === undefined || value === null) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function humanize(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function modelNameForSelection(selection: ResumeAiSelection) {
  return ALL_MODELS.find((model) => model.providerId === selection.provider && model.id === selection.model)?.name ?? selection.model
}

function formatEffort(value: string) {
  if (value === "extra-high" || value === "xhigh") return "Extra High"
  if (value === "auto") return "Default"
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function toErrorMessage(reason: unknown, fallback: string) {
  if (typeof reason === "string" && reason.trim()) return reason
  if (reason instanceof Error && reason.message.trim()) return reason.message
  return fallback
}

type ModelProviderId = ResumeAiSelection["provider"]

type ModelProvider = AgentModelProvider
type AiModel = AgentModel

type ReasoningLevel = "auto" | "low" | "medium" | "high" | "extra-high" | "xhigh" | "max"
type ServiceTier = "standard" | "fast"
type ModelFilter = ModelProviderId | "favorites"
type ReasoningOption = { id: ReasoningLevel; label: string; isDefault?: boolean }

export const DEFAULT_RESUME_AI_SELECTION: ResumeAiSelection = {
  provider: "codex",
  model: DEFAULT_CODEX_MODEL_ID,
  effort: "max",
}

const MODEL_PROVIDERS: ModelProvider[] = AGENT_MODEL_PROVIDERS
const ALL_MODELS = ALL_AGENT_MODELS

const CLAUDE_OPUS_4_7_EFFORT_LEVELS: ReasoningOption[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra High", isDefault: true },
  { id: "max", label: "Max" },
]

const CLAUDE_STANDARD_EFFORT_LEVELS: ReasoningOption[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High", isDefault: true },
  { id: "max", label: "Max" },
]

const CLAUDE_DEFAULT_EFFORT_LEVELS: ReasoningOption[] = [
  { id: "auto", label: "Default", isDefault: true },
]

const CLAUDE_EFFORT_LEVELS_BY_MODEL: Record<string, ReasoningOption[]> = {
  "claude-opus-4-7": CLAUDE_OPUS_4_7_EFFORT_LEVELS,
  "claude-opus-4-6": CLAUDE_STANDARD_EFFORT_LEVELS,
  "claude-sonnet-4-6": CLAUDE_STANDARD_EFFORT_LEVELS,
}

const SERVICE_TIERS: { id: ServiceTier; label: string; isDefault?: boolean }[] = [
  { id: "standard", label: "Standard", isDefault: true },
  { id: "fast", label: "Fast" },
]

function JobTargetSelector({
  disabled,
  locked = false,
  value,
  jobs,
  loading,
  error,
  onRefresh,
  onChange,
}: {
  disabled?: boolean
  locked?: boolean
  value: TheirStackJob | null
  jobs: TheirStackJob[]
  loading: boolean
  error: string
  onRefresh: () => void
  onChange: (job: TheirStackJob | null) => void
}) {
  const searchRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const needle = search.trim().toLowerCase()
  const visibleJobs = jobs.filter((job) => {
    if (!needle) return true
    return `${job.jobTitle} ${job.company ?? ""} ${job.location ?? ""} ${job.longLocation ?? ""}`
      .toLowerCase()
      .includes(needle)
  })

  useEffect(() => {
    if (!open) return
    window.requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }))
  }, [open])

  function handleOpenChange(nextOpen: boolean) {
    if (disabled && nextOpen) return
    if (nextOpen) {
      setSearch("")
      setActiveIndex(0)
    }
    setOpen(nextOpen)
  }

  function selectJob(job: TheirStackJob | null) {
    onChange(job)
    setOpen(false)
    setSearch("")
    setActiveIndex(0)
  }

  function handleListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!visibleJobs.length) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, visibleJobs.length - 1))
      itemRefs.current[Math.min(activeIndex + 1, visibleJobs.length - 1)]?.focus()
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      itemRefs.current[Math.max(activeIndex - 1, 0)]?.focus()
    } else if (event.key === "Home") {
      event.preventDefault()
      setActiveIndex(0)
      itemRefs.current[0]?.focus()
    } else if (event.key === "End") {
      event.preventDefault()
      setActiveIndex(visibleJobs.length - 1)
      itemRefs.current[visibleJobs.length - 1]?.focus()
    }
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!visibleJobs.length) return
    if (event.key === "ArrowDown" || event.key === "Home" || event.key === "End") {
      event.preventDefault()
      const index = event.key === "End" ? visibleJobs.length - 1 : 0
      setActiveIndex(index)
      itemRefs.current[index]?.focus()
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div className="resume-ai-selector-control resume-ai-job-control">
      <PopoverTrigger asChild>
        <Button
        type="button"
        variant="ghost"
        size="icon"
        className="resume-ai-selector-trigger resume-ai-job-trigger is-icon-only"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={value ? `Target job: ${value.jobTitle}` : "Choose a saved job to target"}
        disabled={disabled}
        title={locked
          ? "This resume copy is tied to its saved job"
          : value
            ? `${value.jobTitle} at ${value.company || "Company not provided"}`
            : "Choose a saved job to target"}
      >
        <BriefcaseBusiness aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      {open ? (
        <PopoverContent className="resume-ai-job-popover" side="top" align="start" sideOffset={13} collisionPadding={16} role="dialog" aria-label="Target job selector">
          <div className="resume-ai-job-popover-header">
            <div>
              <strong>Target a saved job</strong>
              <span>The AI will use the job and saved research as context.</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onRefresh}
              aria-label="Refresh saved jobs"
              title="Refresh saved jobs"
              disabled={loading}
            >
              <RefreshCw className={loading ? "animate-spin" : ""} aria-hidden="true" />
            </Button>
          </div>
          <label className="resume-ai-model-search resume-ai-job-search">
            <Search aria-hidden="true" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(event) => { setSearch(event.currentTarget.value); setActiveIndex(0) }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search saved jobs..."
              aria-label="Search saved jobs"
            />
          </label>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              className="resume-ai-job-clear"
              onClick={() => selectJob(null)}
            >
              <X aria-hidden="true" />
              <span>Remove job target</span>
            </Button>
          ) : null}
          <div className="resume-ai-job-list" role="listbox" aria-label="Saved jobs" onKeyDown={handleListKeyDown}>
            {loading ? (
              <div className="resume-ai-job-empty"><LoaderCircle className="animate-spin" aria-hidden="true" /> Loading saved jobs...</div>
            ) : error ? (
              <div className="resume-ai-job-empty resume-ai-job-error">
                <span>{error}</span>
                <Button type="button" size="sm" variant="outline" onClick={onRefresh}>Try again</Button>
              </div>
            ) : visibleJobs.length ? visibleJobs.map((job, index) => (
              <Button
                ref={(element) => { itemRefs.current[index] = element }}
                key={job.id}
                type="button"
                variant="ghost"
                className={`resume-ai-job-item ${job.id === value?.id ? "is-selected" : ""}`.trim()}
                onClick={() => selectJob(job)}
                role="option"
                aria-selected={job.id === value?.id}
              >
                <span className="resume-ai-job-item-title">{job.jobTitle}</span>
                <span className="resume-ai-job-item-meta">
                  {job.company || "Company not provided"}
                  {job.location || job.longLocation ? ` · ${job.location || job.longLocation}` : ""}
                </span>
              </Button>
            )) : (
              <div className="resume-ai-job-empty">
                {jobs.length ? "No saved jobs match that title." : "No saved jobs yet."}
              </div>
            )}
          </div>
        </PopoverContent>
      ) : null}
      </div>
    </Popover>
  )
}

function resumeDisplayName(resume: ResumeFile) {
  return resume.data.basics?.name?.trim() || resume.fileName.replace(/\.json$/i, "") || "Untitled resume"
}

function resumeDisplayMeta(resume: ResumeFile) {
  const headline = resume.data.basics?.headline?.trim()
  return headline ? `${headline} · ${resume.fileName}` : resume.fileName
}

function ResumeTargetSelector({
  disabled,
  value,
  resumes,
  loading,
  error,
  onRefresh,
  onChange,
}: {
  disabled?: boolean
  value: ResumeFile | null
  resumes: ResumeFile[]
  loading: boolean
  error: string
  onRefresh: () => void
  onChange: (resume: ResumeFile | null) => void
}) {
  const searchRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const needle = search.trim().toLowerCase()
  const visibleResumes = resumes.filter((resume) => {
    if (!needle) return true
    return [
      resumeDisplayName(resume),
      resume.fileName,
      resume.data.basics?.headline,
      resume.data.basics?.location,
      resume.data.basics?.email,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle)
  })

  useEffect(() => {
    if (!open) return
    window.requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }))
  }, [open])

  function handleOpenChange(nextOpen: boolean) {
    if (disabled && nextOpen) return
    if (nextOpen) {
      setSearch("")
      setActiveIndex(0)
    }
    setOpen(nextOpen)
  }

  function selectResume(resume: ResumeFile | null) {
    onChange(resume)
    setOpen(false)
    setSearch("")
    setActiveIndex(0)
  }

  function handleListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!visibleResumes.length) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, visibleResumes.length - 1))
      itemRefs.current[Math.min(activeIndex + 1, visibleResumes.length - 1)]?.focus()
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      itemRefs.current[Math.max(activeIndex - 1, 0)]?.focus()
    } else if (event.key === "Home") {
      event.preventDefault()
      setActiveIndex(0)
      itemRefs.current[0]?.focus()
    } else if (event.key === "End") {
      event.preventDefault()
      setActiveIndex(visibleResumes.length - 1)
      itemRefs.current[visibleResumes.length - 1]?.focus()
    }
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!visibleResumes.length) return
    if (event.key === "ArrowDown" || event.key === "Home" || event.key === "End") {
      event.preventDefault()
      const index = event.key === "End" ? visibleResumes.length - 1 : 0
      setActiveIndex(index)
      itemRefs.current[index]?.focus()
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div className="resume-ai-selector-control resume-ai-resume-control">
      <PopoverTrigger asChild>
        <Button
        type="button"
        variant="ghost"
        size="icon"
        className="resume-ai-selector-trigger resume-ai-resume-trigger is-icon-only"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={value ? `Target resume: ${resumeDisplayName(value)}` : "Choose a resume to use as context"}
        disabled={disabled}
        title={value ? `${resumeDisplayName(value)} (${value.fileName})` : "Choose a resume to use as context"}
      >
        <FileText aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      {open ? (
        <PopoverContent className="resume-ai-job-popover resume-ai-resume-popover" side="top" align="start" sideOffset={13} collisionPadding={16} role="dialog" aria-label="Target resume selector">
          <div className="resume-ai-job-popover-header">
            <div>
              <strong>Use a resume as context</strong>
              <span>The AI receives the complete selected resume while it works.</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onRefresh}
              aria-label="Refresh resumes"
              title="Refresh resumes"
              disabled={loading}
            >
              <RefreshCw className={loading ? "animate-spin" : ""} aria-hidden="true" />
            </Button>
          </div>
          <label className="resume-ai-model-search resume-ai-job-search">
            <Search aria-hidden="true" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(event) => { setSearch(event.currentTarget.value); setActiveIndex(0) }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search resumes..."
              aria-label="Search resumes"
            />
          </label>
          {value ? (
            <Button
              type="button"
              variant="ghost"
              className="resume-ai-job-clear"
              onClick={() => selectResume(null)}
            >
              <X aria-hidden="true" />
              <span>Remove resume context</span>
            </Button>
          ) : null}
          <div className="resume-ai-job-list" role="listbox" aria-label="Resumes" onKeyDown={handleListKeyDown}>
            {loading ? (
              <div className="resume-ai-job-empty"><LoaderCircle className="animate-spin" aria-hidden="true" /> Loading resumes...</div>
            ) : error ? (
              <div className="resume-ai-job-empty resume-ai-job-error">
                <span>{error}</span>
                <Button type="button" size="sm" variant="outline" onClick={onRefresh}>Try again</Button>
              </div>
            ) : visibleResumes.length ? visibleResumes.map((resume, index) => (
              <Button
                ref={(element) => { itemRefs.current[index] = element }}
                key={resume.id}
                type="button"
                variant="ghost"
                className={`resume-ai-job-item resume-ai-resume-item ${resume.id === value?.id ? "is-selected" : ""}`.trim()}
                onClick={() => selectResume(resume)}
                role="option"
                aria-selected={resume.id === value?.id}
              >
                <span className="resume-ai-job-item-title">{resumeDisplayName(resume)}</span>
                <span className="resume-ai-job-item-meta">{resumeDisplayMeta(resume)}</span>
              </Button>
            )) : (
              <div className="resume-ai-job-empty">
                {resumes.length ? "No resumes match that search." : "No resumes yet."}
              </div>
            )}
          </div>
        </PopoverContent>
      ) : null}
      </div>
    </Popover>
  )
}

export function ModelReasoningSelector({
  disabled,
  iconOnly = false,
  value,
  onChange,
}: {
  disabled?: boolean
  iconOnly?: boolean
  value: ResumeAiSelection
  onChange: (value: ResumeAiSelection) => void
}) {
  const modelSearchRef = useRef<HTMLInputElement>(null)
  const modelItemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [openMenu, setOpenMenu] = useState<"model" | "reasoning" | null>(null)
  const [serviceTier, setServiceTier] = useState<ServiceTier>("standard")
  const [search, setSearch] = useState("")
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set())
  const [activeFilter, setActiveFilter] = useState<ModelFilter>(value.provider)

  const selectedModelData = ALL_MODELS.find(
    (model) => model.providerId === value.provider && model.id === value.model,
  ) ?? ALL_MODELS[0]
  const selectedProvider = MODEL_PROVIDERS.find((provider) => provider.id === value.provider) ?? MODEL_PROVIDERS[0]
  const activeProvider = activeFilter === "favorites"
    ? selectedProvider
    : MODEL_PROVIDERS.find((provider) => provider.id === activeFilter) ?? selectedProvider
  const reasoningLevels = reasoningLevelsForModel(selectedModelData)
  const reasoningLabel = reasoningLevels.find((option) => option.id === value.effort)?.label ?? "Default"
  const serviceTierLabel = SERVICE_TIERS.find((tier) => tier.id === serviceTier)?.label ?? "Standard"
  const visibleModels = ALL_MODELS.filter((model) => {
    const needle = search.trim().toLowerCase()
    const provider = MODEL_PROVIDERS.find((candidate) => candidate.id === model.providerId)
    const matchesSearch = !needle || `${model.name} ${provider?.name ?? ""} ${model.id}`.toLowerCase().includes(needle)
    const matchesRail = activeFilter === "favorites"
      ? favorites.has(modelKey(model))
      : model.providerId === activeFilter
    return matchesSearch && matchesRail
  })

  useEffect(() => {
    if (activeFilter !== "favorites") setActiveFilter(value.provider)
  }, [value.provider])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || openMenu || disabled) return
      const shortcutIndex = Number.parseInt(event.key, 10) - 1
      const shortcutLabel = Number.isInteger(shortcutIndex) ? `Ctrl+${shortcutIndex + 1}` : ""
      const shortcutModels = value.provider === "claude-code" ? CLAUDE_MODELS : CODEX_MODELS
      const shortcutModel = shortcutModels.find((model) => model.shortcut === shortcutLabel)
      if (!shortcutModel) return

      event.preventDefault()
      onChange({
        ...value,
        provider: shortcutModel.providerId,
        model: shortcutModel.id,
        effort: effortForModel(value.effort, shortcutModel),
      })
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [disabled, onChange, openMenu, value])

  useEffect(() => {
    if (openMenu === "model") {
      window.requestAnimationFrame(() => modelSearchRef.current?.focus({ preventScroll: true }))
    }
  }, [openMenu])

  function handleModelOpenChange(open: boolean) {
    if (disabled && open) return
    if (open) {
      setActiveFilter(value.provider)
      setSearch("")
    }
    setOpenMenu(open ? "model" : null)
  }

  function handleReasoningOpenChange(open: boolean) {
    if (disabled && open) return
    setOpenMenu(open ? "reasoning" : null)
  }

  function selectModel(model: AiModel) {
    onChange({
      provider: model.providerId,
      model: model.id,
      effort: effortForModel(value.effort, model),
    })
    setActiveFilter(model.providerId)
    setOpenMenu(null)
  }

  function toggleFavorite(model: AiModel) {
    setFavorites((current) => {
      const next = new Set(current)
      const key = modelKey(model)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleModelListKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!visibleModels.length) return
    const currentIndex = modelItemRefs.current.findIndex((item) => item === document.activeElement)

    if (event.key === "ArrowDown") {
      event.preventDefault()
      modelItemRefs.current[Math.min(currentIndex + 1, visibleModels.length - 1)]?.focus()
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      modelItemRefs.current[Math.max(currentIndex - 1, 0)]?.focus()
    } else if (event.key === "Home") {
      event.preventDefault()
      modelItemRefs.current[0]?.focus()
    } else if (event.key === "End") {
      event.preventDefault()
      modelItemRefs.current[visibleModels.length - 1]?.focus()
    }
  }

  function handleModelSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!visibleModels.length) return
    if (event.key === "ArrowDown" || event.key === "Home" || event.key === "End") {
      event.preventDefault()
      const index = event.key === "End" ? visibleModels.length - 1 : 0
      modelItemRefs.current[index]?.focus()
    }
  }

  return (
    <div className={`resume-ai-selector ${iconOnly ? "is-icon-only" : ""}`.trim()}>
      <Popover open={openMenu === "model"} onOpenChange={handleModelOpenChange}>
        <div className="resume-ai-selector-control resume-ai-model-control">
        <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={iconOnly ? "icon" : "default"}
          className={`resume-ai-selector-trigger resume-ai-model-trigger ${iconOnly ? "is-icon-only" : ""}`.trim()}
          aria-expanded={openMenu === "model"}
          aria-haspopup="dialog"
          aria-label={`AI model: ${selectedModelData.name}`}
          title={`AI model: ${selectedModelData.name}`}
          disabled={disabled}
        >
          <ProviderMark provider={selectedProvider.id} aria-hidden="true" />
          {!iconOnly ? <span>{selectedModelData.name}</span> : null}
          {!iconOnly ? <ChevronDown className="resume-ai-selector-chevron" aria-hidden="true" /> : null}
        </Button>
        </PopoverTrigger>
        {openMenu === "model" ? (
          <PopoverContent className="resume-ai-model-popover" side="top" align="start" sideOffset={13} collisionPadding={16} role="dialog" aria-label="AI model selector">
            <aside className="resume-ai-model-rail" aria-label="Model filters">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={`resume-ai-model-rail-button ${activeFilter === "favorites" ? "is-active" : ""}`.trim()}
                onClick={() => setActiveFilter("favorites")}
                aria-label="Show favorite models"
                aria-pressed={activeFilter === "favorites"}
                title="Favorites"
              >
                <Star aria-hidden="true" />
              </Button>
              <div className="resume-ai-model-rail-divider" />
              {MODEL_PROVIDERS.map((provider) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={`resume-ai-model-rail-button resume-ai-model-provider resume-ai-model-provider-${provider.id} ${activeFilter === provider.id ? "is-active" : ""}`.trim()}
                  onClick={() => setActiveFilter(provider.id)}
                  aria-label={`${provider.name} models`}
                  aria-pressed={activeFilter === provider.id}
                  title={provider.name}
                  key={provider.id}
                >
                  <ProviderMark provider={provider.id} aria-hidden="true" />
                </Button>
              ))}
            </aside>
            <div className="resume-ai-model-main">
              <label className="resume-ai-model-search">
                <Search aria-hidden="true" />
                <Input
                  ref={modelSearchRef}
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  onKeyDown={handleModelSearchKeyDown}
                  placeholder="Search models..."
                  aria-label="Search models"
                />
              </label>
              <div className="resume-ai-model-list" role="listbox" aria-label={`${activeProvider.name} models`} onKeyDown={handleModelListKeyDown}>
                {visibleModels.length ? visibleModels.map((model, index) => (
                  <div
                    className={`resume-ai-model-item ${model.providerId === value.provider && model.id === value.model ? "is-selected" : ""}`.trim()}
                    key={modelKey(model)}
                  >
                    <Button
                      ref={(element) => { modelItemRefs.current[index] = element }}
                      type="button"
                      variant="ghost"
                      className="resume-ai-model-item-select"
                      onClick={() => selectModel(model)}
                      role="option"
                      aria-selected={model.providerId === value.provider && model.id === value.model}
                    >
                      <span className="resume-ai-model-item-name">{model.name}</span>
                      <span className="resume-ai-model-item-provider"><ProviderMark provider={model.providerId} aria-hidden="true" /> {MODEL_PROVIDERS.find((provider) => provider.id === model.providerId)?.name}</span>
                    </Button>
                    <div className="resume-ai-model-item-actions">
                      {model.shortcut ? <Kbd>{model.shortcut}</Kbd> : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className={`resume-ai-model-favorite ${favorites.has(modelKey(model)) ? "is-favorite" : ""}`.trim()}
                        onClick={() => toggleFavorite(model)}
                        aria-label={`${favorites.has(modelKey(model)) ? "Remove" : "Add"} ${model.name} ${favorites.has(modelKey(model)) ? "from" : "to"} favorites`}
                        aria-pressed={favorites.has(modelKey(model))}
                      >
                        <Star aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="resume-ai-model-empty">
                    {activeFilter === "favorites" ? "No favorite models yet" : "No models found"}
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        ) : null}
        </div>
      </Popover>

      {!iconOnly ? <span className="resume-ai-selector-divider" aria-hidden="true" /> : null}

      <Popover open={openMenu === "reasoning"} onOpenChange={handleReasoningOpenChange}>
        <div className="resume-ai-selector-control resume-ai-reasoning-control">
        <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={iconOnly ? "icon" : "default"}
          className={`resume-ai-selector-trigger resume-ai-reasoning-trigger ${iconOnly ? "is-icon-only" : ""}`.trim()}
          aria-expanded={openMenu === "reasoning"}
          aria-haspopup="menu"
          aria-label={value.provider === "codex"
            ? `Reasoning: ${reasoningLabel}; service tier: ${serviceTierLabel}`
            : `Effort: ${reasoningLabel}`}
          title={value.provider === "codex"
            ? `Reasoning: ${reasoningLabel} · Service tier: ${serviceTierLabel}`
            : `Effort: ${reasoningLabel}`}
          disabled={disabled}
        >
          {iconOnly ? <Brain aria-hidden="true" /> : (
            <>
              <span>{value.provider === "codex" ? `${reasoningLabel} · ${serviceTierLabel}` : `Effort · ${reasoningLabel}`}</span>
              <ChevronDown className="resume-ai-selector-chevron" aria-hidden="true" />
            </>
          )}
        </Button>
        </PopoverTrigger>
        {openMenu === "reasoning" ? (
          <PopoverContent className="resume-ai-reasoning-popover" side="top" align="start" sideOffset={12} collisionPadding={16} role="menu" aria-label={`${value.provider === "codex" ? "Reasoning" : "Effort"} settings`}>
            <div className="resume-ai-reasoning-section">
              <p>{value.provider === "codex" ? "Reasoning" : "Effort"}</p>
              {reasoningLevels.map((option) => (
                <Button
                  type="button"
                  variant="ghost"
                  className={`resume-ai-reasoning-option ${option.id === value.effort ? "is-selected" : ""}`.trim()}
                  key={option.id}
                  onClick={() => { onChange({ ...value, effort: option.id }); setOpenMenu(null) }}
                  role="menuitemradio"
                  aria-checked={option.id === value.effort}
                >
                  <span>{option.label}</span>
                  {option.isDefault ? <em>Default</em> : null}
                </Button>
              ))}
            </div>
            {value.provider === "codex" ? (
            <div className="resume-ai-reasoning-section resume-ai-service-tier-section">
              <p>Service Tier</p>
              {SERVICE_TIERS.map((tier) => (
                <Button
                  type="button"
                  variant="ghost"
                  className={`resume-ai-reasoning-option ${tier.id === serviceTier ? "is-selected" : ""}`.trim()}
                  key={tier.id}
                  onClick={() => { setServiceTier(tier.id); setOpenMenu(null) }}
                  role="menuitemradio"
                  aria-checked={tier.id === serviceTier}
                >
                  <span>{tier.label}</span>
                  {tier.isDefault ? <em>Default</em> : null}
                </Button>
              ))}
            </div>
            ) : null}
          </PopoverContent>
        ) : null}
        </div>
      </Popover>
    </div>
  )
}

function modelKey(model: AiModel) {
  return `${model.providerId}:${model.id}`
}

function reasoningLevelsForModel(model: AiModel): ReasoningOption[] {
  if (model.providerId === "codex") return CODEX_REASONING_LEVELS
  return CLAUDE_EFFORT_LEVELS_BY_MODEL[model.id] ?? CLAUDE_DEFAULT_EFFORT_LEVELS
}

function effortForModel(effort: string, model: AiModel): ReasoningLevel {
  const levels = reasoningLevelsForModel(model)
  if (levels.some((option) => option.id === effort)) return effort as ReasoningLevel

  if (model.providerId === "codex") return "max"
  return levels.find((option) => option.isDefault)?.id ?? "auto"
}

function ProviderMark({
  provider,
  ...props
}: { provider: ModelProviderId } & ComponentProps<"img">) {
  return <img
    className="resume-ai-provider-logo"
    src={provider === "claude-code" ? "/harnesses/claude-ai-icon.svg" : "/harnesses/openai_dark.svg"}
    alt=""
    {...props}
  />
}
