import type { AgentProviderId } from "@/lib/agent-providers"

export type AgentModel = {
  id: string
  name: string
  providerId: AgentProviderId
  shortcut?: string
}

export type AgentModelProvider = {
  id: AgentProviderId
  name: string
}

export type CodexReasoningLevel = "low" | "medium" | "high" | "extra-high" | "max"

export type AgentReasoningOption = {
  id: CodexReasoningLevel
  label: string
  isDefault?: boolean
}

export const DEFAULT_CODEX_MODEL_ID = "gpt-5.6-luna"

export const AGENT_MODEL_PROVIDERS: AgentModelProvider[] = [
  { id: "codex", name: "Codex" },
  { id: "claude-code", name: "Claude Code" },
]

export const CODEX_MODELS: AgentModel[] = [
  { id: "gpt-5.6-sol", name: "GPT-5.6-Sol", providerId: "codex", shortcut: "Ctrl+1" },
  { id: "gpt-5.6-terra", name: "GPT-5.6-Terra", providerId: "codex", shortcut: "Ctrl+2" },
  { id: "gpt-5.6-luna", name: "GPT-5.6-Luna", providerId: "codex", shortcut: "Ctrl+3" },
  { id: "gpt-5.5", name: "GPT-5.5", providerId: "codex", shortcut: "Ctrl+4" },
  { id: "gpt-5.4", name: "GPT-5.4", providerId: "codex", shortcut: "Ctrl+5" },
  { id: "gpt-5.4-mini", name: "GPT-5.4-Mini", providerId: "codex" },
]

export const CODEX_REASONING_LEVELS: AgentReasoningOption[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium", isDefault: true },
  { id: "high", label: "High" },
  { id: "extra-high", label: "Extra High" },
  { id: "max", label: "Max" },
]

export const CLAUDE_MODELS: AgentModel[] = [
  { id: "claude-opus-5", name: "Claude Opus 5", providerId: "claude-code", shortcut: "Ctrl+1" },
  { id: "claude-opus-4-8", name: "Claude Opus 4.8", providerId: "claude-code" },
  { id: "claude-opus-4-7", name: "Claude Opus 4.7", providerId: "claude-code" },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", providerId: "claude-code" },
  { id: "claude-opus-4-5", name: "Claude Opus 4.5", providerId: "claude-code" },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", providerId: "claude-code", shortcut: "Ctrl+2" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", providerId: "claude-code" },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", providerId: "claude-code" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", providerId: "claude-code", shortcut: "Ctrl+3" },
]

export const ALL_AGENT_MODELS = [...CODEX_MODELS, ...CLAUDE_MODELS]
