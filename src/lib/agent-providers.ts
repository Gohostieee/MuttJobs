import { invoke } from "@tauri-apps/api/core"

export type AgentProviderId = "codex"

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

export type ProviderSettingsDocument = {
  schemaVersion: 1
  providers: {
    codex: CodexProviderSettings
  }
}

export type AgentProviderHealth = {
  providerId: AgentProviderId
  state: ProviderHealthState
  executablePath?: string
  version?: string
  authenticated?: boolean
  checkedAt: string
  message?: string
}

export const getProviderSettings = () =>
  invoke<ProviderSettingsDocument>("get_provider_settings")

export const updateProviderSettings = (settings: CodexProviderSettings) =>
  invoke<ProviderSettingsDocument>("update_provider_settings", { settings })

export const getProviderHealth = () =>
  invoke<AgentProviderHealth>("get_provider_health")

export const refreshProviderHealth = () =>
  invoke<AgentProviderHealth>("refresh_provider_health")
