import { Codex, type ModelReasoningEffort, type ThreadEvent } from "@openai/codex-sdk"

import type { AgentJobRequest, WorkerEvent } from "./protocol.js"
import { PROTOCOL_VERSION } from "./protocol.js"

type Emit = (event: WorkerEvent) => void

/**
 * The worker is deliberately provider-focused. Product features supply the
 * job kind, prompt, and output schema later; this layer only owns the SDK
 * thread lifecycle and safe event translation.
 */
export class CodexJobRunner {
  readonly #codexPath: string
  readonly #active = new Map<string, AbortController>()

  constructor(codexPath: string) {
    this.#codexPath = codexPath
  }

  cancel(jobId: string) {
    return this.#active.get(jobId)?.abort() ?? false
  }

  async run(requestId: string, job: AgentJobRequest, emit: Emit) {
    if (this.#active.has(job.jobId)) throw new Error("job is already active")

    const controller = new AbortController()
    this.#active.set(job.jobId, controller)
    const base = { protocolVersion: PROTOCOL_VERSION, requestId, jobId: job.jobId } as const

    try {
      emit({ ...base, type: "job_accepted" })
      const codex = new Codex({ codexPathOverride: this.#codexPath })
      const thread = codex.startThread({
        workingDirectory: job.workingDirectory,
        sandboxMode: job.execution.sandboxMode,
        approvalPolicy: job.execution.approvalPolicy,
        networkAccessEnabled: job.execution.networkAccessEnabled,
        webSearchMode: "disabled",
        skipGitRepoCheck: !job.isGitRepository,
        model: job.model ?? undefined,
        modelReasoningEffort: job.reasoningEffort as ModelReasoningEffort | undefined,
      })
      const streamed = await thread.runStreamed(job.prompt, {
        outputSchema: job.outputSchema,
        signal: controller.signal,
      })

      let finalResponse = ""
      for await (const event of streamed.events) {
        translateEvent(event, base, emit)
        if (event.type === "item.completed" && event.item.type === "agent_message") {
          finalResponse = event.item.text
        }
      }

      if (controller.signal.aborted) {
        emit({ ...base, type: "job_cancelled" })
      } else if (finalResponse) {
        emit({ ...base, type: "job_completed", output: JSON.parse(finalResponse) })
      } else {
        emit({
          ...base,
          type: "job_failed",
          code: "empty_output",
          message: "Codex returned no structured output.",
        })
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        emit({ ...base, type: "job_cancelled" })
      } else {
        const message = error instanceof Error ? error.message : "Codex job failed."
        console.error(`[job ${job.jobId}] sdk_error: ${message}`)
        emit({ ...base, type: "job_failed", code: "sdk_error", message })
      }
    } finally {
      this.#active.delete(job.jobId)
    }
  }
}

function translateEvent(event: ThreadEvent, base: Omit<WorkerEvent, "type">, emit: Emit) {
  if (event.type === "turn.started") {
    emit({ ...base, type: "job_progress", stage: "exploring" })
  } else if (event.type === "turn.completed") {
    emit({ ...base, type: "job_usage", usage: event.usage })
  } else if (event.type === "turn.failed") {
    emit({ ...base, type: "job_failed", code: "turn_failed", message: event.error.message })
  } else if (event.type === "error") {
    emit({ ...base, type: "worker_error", message: event.message })
  } else if (
    event.type === "item.started" ||
    event.type === "item.updated" ||
    event.type === "item.completed"
  ) {
    // Activity is intentionally metadata-only. Never forward commands, paths,
    // tool payloads, source content, agent text, or reasoning text.
    const status = event.type === "item.completed"
      ? ("status" in event.item && event.item.status === "failed" ? "failed" : "completed")
      : "running"
    emit({
      ...base,
      type: "job_item",
      itemId: event.item.id,
      itemType: event.item.type,
      itemStatus: status,
    })
  }
}
