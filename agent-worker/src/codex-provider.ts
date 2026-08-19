import {
  Codex,
  type ModelReasoningEffort,
  type ThreadEvent,
  type ThreadItem,
  type Usage,
} from "@openai/codex-sdk"

import type { AgentJobRequest, WorkerEvent } from "./protocol.js"
import { PROTOCOL_VERSION } from "./protocol.js"

type Emit = (event: WorkerEvent) => void
type EventBase = {
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  jobId: string
}

const CODEX_CONTEXT_WINDOW_TOKENS = 258_400

const BUILT_IN_CODEX_MODELS = new Set([
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.5",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
])

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
      const reasoningEffort = normalizeCodexReasoningEffort(job.reasoningEffort)
      console.error(
        `[job ${job.jobId}] start provider=codex model=${job.model ?? "<default>"} `
        + `requestedEffort=${job.reasoningEffort ?? "<default>"} `
        + `effectiveEffort=${reasoningEffort ?? "<default>"} `
        + `webSearch=${job.execution.networkAccessEnabled ? "live" : "disabled"}`,
      )
      emit({ ...base, type: "job_accepted" })
      const codex = new Codex({
        codexPathOverride: this.#codexPath,
        // Codex emits a reasoning item when this flag is enabled. The UI
        // renders it as a collapsible trace, so the user can inspect the
        // agent's work without losing the compact conversation view.
        config: { show_raw_agent_reasoning: true },
      })
      const thread = codex.startThread({
        workingDirectory: job.workingDirectory,
        sandboxMode: job.execution.sandboxMode,
        approvalPolicy: job.execution.approvalPolicy,
        networkAccessEnabled: job.execution.networkAccessEnabled,
        webSearchMode: job.execution.networkAccessEnabled ? "live" : "disabled",
        skipGitRepoCheck: !job.isGitRepository,
        model: job.model ?? undefined,
        modelReasoningEffort: reasoningEffort,
      })
      const streamed = await thread.runStreamed(job.prompt, {
        outputSchema: job.outputSchema,
        signal: controller.signal,
      })

      let finalResponse = ""
      for await (const event of streamed.events) {
        translateEvent(event, base, emit, job.model)
        if (
          (event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed")
          && event.item.type === "web_search"
        ) {
          console.error(
            `[job ${job.jobId}] web_search event=${event.type} item=${event.item.id} `
            + `query=${JSON.stringify(event.item.query.slice(0, 240))}`,
          )
        }
        if (event.type === "item.completed" && event.item.type === "agent_message") {
          finalResponse = event.item.text
        }
      }

      if (controller.signal.aborted) {
        console.error(`[job ${job.jobId}] cancelled`)
        emit({ ...base, type: "job_cancelled" })
      } else if (finalResponse) {
        console.error(`[job ${job.jobId}] completed structuredOutputChars=${finalResponse.length}`)
        emit({ ...base, type: "job_completed", output: JSON.parse(finalResponse) })
      } else {
        console.error(`[job ${job.jobId}] failed reason=empty_output`)
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

function normalizeCodexReasoningEffort(value: string | null | undefined): ModelReasoningEffort | undefined {
  switch (value) {
    case "minimal":
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return value
    case "extra-high":
    case "max":
      console.error(`[codex] mapping unsupported UI effort ${value} to SDK effort xhigh`)
      return "xhigh"
    case undefined:
    case null:
    case "":
    case "auto":
      return undefined
    default:
      console.error(`[codex] omitting unsupported reasoning effort ${value}`)
      return undefined
  }
}

function translateEvent(
  event: ThreadEvent,
  base: EventBase,
  emit: Emit,
  model?: string | null,
) {
  if (event.type === "thread.started") {
    emit({ ...base, type: "job_thread", threadId: event.thread_id })
  } else if (event.type === "turn.started") {
    emit({ ...base, type: "job_progress", stage: "exploring" })
  } else if (event.type === "turn.completed") {
    const usage = normalizeCodexUsage(event.usage, model)
    if (usage) {
      emit({ ...base, type: "job_usage", usage })
    }
  } else if (event.type === "turn.failed") {
    emit({ ...base, type: "job_failed", code: "turn_failed", message: event.error.message })
  } else if (event.type === "error") {
    emit({ ...base, type: "worker_error", message: event.message })
  } else if (
    event.type === "item.started" ||
    event.type === "item.updated" ||
    event.type === "item.completed"
  ) {
    const status = event.type === "item.completed"
      ? ("status" in event.item && event.item.status === "failed" ? "failed" : "completed")
      : "running"
    emit({
      ...base,
      type: "job_item",
      eventType: event.type,
      itemId: event.item.id,
      itemType: event.item.type,
      itemStatus: status,
      item: boundItem(event.item),
    })
  }
}

function normalizeCodexUsage(usage: Usage, model?: string | null) {
  const inputTokens = nonNegativeFinite(usage.input_tokens) ?? 0
  const cachedInputTokens = nonNegativeFinite(usage.cached_input_tokens) ?? 0
  const outputTokens = nonNegativeFinite(usage.output_tokens) ?? 0
  const reasoningOutputTokens = nonNegativeFinite(usage.reasoning_output_tokens) ?? 0
  // The SDK's turn usage does not expose app-server's `last.totalTokens`.
  // `input_tokens + output_tokens` is the closest safe representation of the
  // active context used by this turn; reasoning is already included in the
  // provider's output total and must not be counted twice.
  const usedTokens = inputTokens + outputTokens
  if (usedTokens <= 0) return undefined
  const maxTokens = contextWindowForModel(model)

  return {
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    cache_write_input_tokens: nonNegativeFinite(usage.cache_write_input_tokens) ?? 0,
    output_tokens: outputTokens,
    reasoning_output_tokens: reasoningOutputTokens,
    usedTokens,
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    lastUsedTokens: usedTokens,
    lastInputTokens: inputTokens,
    lastCachedInputTokens: cachedInputTokens,
    lastOutputTokens: outputTokens,
    lastReasoningOutputTokens: reasoningOutputTokens,
    compactsAutomatically: true,
    updatedAt: new Date().toISOString(),
  }
}

function contextWindowForModel(model?: string | null) {
  const normalized = model?.trim().toLowerCase()
  if (!normalized || BUILT_IN_CODEX_MODELS.has(normalized)) {
    return CODEX_CONTEXT_WINDOW_TOKENS
  }
  return undefined
}

function nonNegativeFinite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined
}

/** Keep one unusually large command/result from taking down the JSONL worker. */
function boundItem(item: ThreadItem) {
  const value = { ...(item as unknown as Record<string, unknown>) }
  for (const key of ["aggregated_output", "text", "query"]) {
    const candidate = value[key]
    if (typeof candidate === "string" && candidate.length > 300_000) {
      value[key] = `${candidate.slice(0, 300_000)}\n… output truncated …`
    }
  }
  return value
}
