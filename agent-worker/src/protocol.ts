export const PROTOCOL_VERSION = 1
export const MAX_MESSAGE_BYTES = 2 * 1024 * 1024
export const WORKER_BUILD = "provider-foundation-1"
export const SDK_VERSION = "0.147.0"

export type WorkerRequest =
  | { protocolVersion: 1; requestId: string; type: "initialize"; codexPath: string }
  | { protocolVersion: 1; requestId: string; type: "health" }
  | { protocolVersion: 1; requestId: string; type: "start_job"; job: AgentJobRequest }
  | { protocolVersion: 1; requestId: string; type: "cancel_job"; jobId: string }
  | { protocolVersion: 1; requestId: string; type: "shutdown" }

export type AgentJobRequest = {
  jobId: string
  kind: string
  workingDirectory: string
  prompt: string
  outputSchema: object
  model?: string | null
  reasoningEffort?: string | null
  isGitRepository: boolean
  execution: {
    sandboxMode: "read-only" | "workspace-write"
    approvalPolicy: "never"
    networkAccessEnabled: false
  }
}

export type WorkerEvent = {
  protocolVersion: 1
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
