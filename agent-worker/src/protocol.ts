export const PROTOCOL_VERSION = 3
export const MAX_MESSAGE_BYTES = 2 * 1024 * 1024
export const WORKER_BUILD = "provider-foundation-3"
export const SDK_VERSION = "0.147.0"

export type AgentProviderId = "codex" | "claude-code"

export type WorkerRequest =
  | {
      protocolVersion: typeof PROTOCOL_VERSION
      requestId: string
      type: "initialize"
      codexPath?: string | null
      claudePath?: string | null
    }
  | { protocolVersion: typeof PROTOCOL_VERSION; requestId: string; type: "health" }
  | { protocolVersion: typeof PROTOCOL_VERSION; requestId: string; type: "start_job"; job: AgentJobRequest }
  | { protocolVersion: typeof PROTOCOL_VERSION; requestId: string; type: "cancel_job"; jobId: string }
  | { protocolVersion: typeof PROTOCOL_VERSION; requestId: string; type: "shutdown" }

export type AgentJobRequest = {
  jobId: string
  kind: string
  provider: AgentProviderId
  workingDirectory: string
  prompt: string
  selection?: object | null
  selectionAction?: string | null
  outputSchema: object
  model?: string | null
  reasoningEffort?: string | null
  isGitRepository: boolean
  execution: {
    sandboxMode: "read-only" | "workspace-write"
    approvalPolicy: "never"
    networkAccessEnabled: boolean
  }
}

export type WorkerEvent = {
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  jobId?: string
  type: string
  [key: string]: unknown
}

export function encodeMessage(message: object) {
  const encoded = JSON.stringify(message)
  if (Buffer.byteLength(encoded, "utf8") > MAX_MESSAGE_BYTES) {
    throw new Error("worker message exceeds 2 MiB limit")
  }
  return `${encoded}\n`
}
