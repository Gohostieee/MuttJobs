import { invoke } from "@tauri-apps/api/core"

export type AgentProviderId = "codex" | "claude-code"

export type ProviderHealthState =
  | "disabled"
  | "checking"
  | "available"
  | "not_found"
  | "authentication_required"
  | "unsupported_version"
  | "worker_unavailable"
  | "unhealthy"

export type CodexProviderSettings = {
  enabled: boolean
  executableMode: "automatic" | "custom"
  executablePath: string | null
  healthIntervalSeconds: number
  modelOverride: string | null
  reasoningEffort: string | null
}

export type ClaudeCodeProviderSettings = CodexProviderSettings

export type TheirStackProviderSettings = {
  enabled: boolean
  apiKey: string | null
  healthIntervalSeconds: number
}

export type ProviderSettingsDocument = {
  schemaVersion: 3
  providers: {
    codex: CodexProviderSettings
    claudeCode: ClaudeCodeProviderSettings
    theirStack: TheirStackProviderSettings
  }
}

export type TheirStackCreditBalance = {
  apiCredits: number
  usedApiCredits: number
  earliestExpiration?: string
}

export type AgentProviderHealth = {
  providerId: AgentProviderId | "theirstack"
  state: ProviderHealthState
  executablePath?: string
  version?: string
  authenticated?: boolean
  checkedAt: string
  message?: string
  creditBalance?: TheirStackCreditBalance
}

export type ProviderHealthDocument = {
  providers: AgentProviderHealth[]
}

export const getProviderSettings = () =>
  invoke<ProviderSettingsDocument>("get_provider_settings")

export const updateProviderSettings = (settings: CodexProviderSettings) =>
  invoke<ProviderSettingsDocument>("update_provider_settings", { settings })

export const updateClaudeProviderSettings = (settings: ClaudeCodeProviderSettings) =>
  invoke<ProviderSettingsDocument>("update_claude_provider_settings", { settings })

export const updateTheirStackProviderSettings = (settings: TheirStackProviderSettings) =>
  invoke<ProviderSettingsDocument>("update_their_stack_provider_settings", { settings })

export const getProviderHealth = () =>
  invoke<ProviderHealthDocument>("get_provider_health")

export const refreshProviderHealth = () =>
  invoke<ProviderHealthDocument>("refresh_provider_health")
