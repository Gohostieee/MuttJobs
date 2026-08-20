import { createInterface } from "node:readline"

import { ClaudeCodeJobRunner } from "./claude-provider.js"
import { CodexJobRunner } from "./codex-provider.js"
import {
  type AgentProviderId,
  encodeMessage,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  SDK_VERSION,
  WORKER_BUILD,
  type WorkerEvent,
  type WorkerRequest,
} from "./protocol.js"

type JobRunner = CodexJobRunner | ClaudeCodeJobRunner

const runners = new Map<AgentProviderId, JobRunner>()
let shuttingDown = false

function emit(event: WorkerEvent) {
  process.stdout.write(encodeMessage(event))
}

function error(requestId: string, message: string) {
  emit({ protocolVersion: PROTOCOL_VERSION, requestId, type: "worker_error", message })
}

async function handle(request: WorkerRequest) {
  if (request.protocolVersion !== PROTOCOL_VERSION) {
    error(
      request.requestId,
      `Unsupported worker protocol ${String(request.protocolVersion)}; expected ${PROTOCOL_VERSION}.`,
    )
    return
  }

  switch (request.type) {
    case "initialize":
      runners.clear()
      if (request.codexPath) runners.set("codex", new CodexJobRunner(request.codexPath))
      if (request.claudePath) runners.set("claude-code", new ClaudeCodeJobRunner(request.claudePath))
      emit({
        protocolVersion: PROTOCOL_VERSION,
        requestId: request.requestId,
        type: "ready",
        workerBuild: WORKER_BUILD,
        sdkVersion: SDK_VERSION,
      })
      break
    case "health":
      if (!runners.size) return error(request.requestId, "Worker has not been initialized.")
      emit({
        protocolVersion: PROTOCOL_VERSION,
        requestId: request.requestId,
        type: "ready",
        workerBuild: WORKER_BUILD,
        sdkVersion: SDK_VERSION,
      })
      break
    case "start_job":
      {
        const runner = runners.get(request.job.provider)
        if (!runner) return error(request.requestId, `The ${request.job.provider} provider is not initialized.`)
        void runner.run(request.requestId, request.job, emit)
      }
      break
    case "cancel_job":
      if (![...runners.values()].some((runner) => runner.cancel(request.jobId))) {
        error(request.requestId, "No matching active job.")
      }
      break
    case "shutdown":
      shuttingDown = true
      emit({ protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, type: "ready", shuttingDown: true })
      process.stdin.destroy()
      break
  }
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity })
input.on("line", (line) => {
  if (shuttingDown) return
  if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) {
    error("unknown", "Worker request exceeds 2 MiB limit.")
    return
  }
  try {
    void handle(JSON.parse(line) as WorkerRequest).catch((cause: unknown) => {
      error("unknown", cause instanceof Error ? cause.message : "Malformed worker request.")
    })
  } catch {
    error("unknown", "Malformed worker JSON.")
  }
})

process.on("uncaughtException", (cause) => {
  console.error("worker uncaught exception", cause)
  error("unknown", "The agent worker stopped unexpectedly.")
})
