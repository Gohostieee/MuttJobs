import { spawn, type ChildProcessByStdio } from "node:child_process"
import type { Readable } from "node:stream"

import type { AgentJobRequest, WorkerEvent } from "./protocol.js"
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION } from "./protocol.js"

type Emit = (event: WorkerEvent) => void
type EventBase = {
  protocolVersion: typeof PROTOCOL_VERSION
  requestId: string
  jobId: string
}
type ClaudeChildProcess = ChildProcessByStdio<null, Readable, Readable>
type ClaudeTranslatedEvent = { type: string; [key: string]: unknown }

type ActiveJob = {
  child: ClaudeChildProcess
  cancelled: boolean
}

/**
 * Runs Claude Code through its supported non-interactive CLI surface. The
 * worker owns the process so the desktop shell never needs to launch a local
 * executable from the browser context.
 */
export class ClaudeCodeJobRunner {
  readonly #claudePath: string
  readonly #active = new Map<string, ActiveJob>()

  constructor(claudePath: string) {
    this.#claudePath = claudePath
  }

  cancel(jobId: string) {
    const active = this.#active.get(jobId)
    if (!active) return false
    active.cancelled = true
    active.child.kill()
    return true
  }

  async run(requestId: string, job: AgentJobRequest, emit: Emit) {
    if (this.#active.has(job.jobId)) throw new Error("job is already active")

    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--json-schema",
      JSON.stringify(job.outputSchema),
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      "Read,Edit,Write",
      "--tools",
      "Read,Edit,Write",
      // `--bare` disables OAuth and keychain reads. Provider health accepts
      // Claude.ai subscription login, so keep the user's normal auth sources
      // available to the non-interactive process.
      "--no-session-persistence",
      "--max-turns",
      "8",
    ]

    if (job.model) args.push("--model", job.model)
    const effort = toClaudeEffort(job.reasoningEffort)
    if (effort) args.push("--effort", effort)
    args.push(job.prompt)

    const child = spawn(this.#claudePath, args, {
      cwd: job.workingDirectory,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    const active: ActiveJob = { child, cancelled: false }
    this.#active.set(job.jobId, active)
    const base: EventBase = { protocolVersion: PROTOCOL_VERSION, requestId, jobId: job.jobId }

    try {
      emit({ ...base, type: "job_accepted" })
      emit({ ...base, type: "job_progress", stage: "working" })

      const streamState = createClaudeStreamState()
      let structuredOutput: unknown
      const result = await waitForProcess(child, (line) => {
        const event = parseJsonLine(line)
        if (!event) return
        const output = event.structured_output ?? event.structuredOutput
        if (event.type === "result" && output !== undefined) structuredOutput = output
        for (const translated of translateClaudeEvent(event, streamState)) {
          emit({ ...base, ...translated })
        }
      })
      if (result.limitExceeded) {
        emit({
          ...base,
          type: "job_failed",
          code: "output_too_large",
          message: "Claude Code returned more than 2 MiB of output.",
        })
        return
      }
      if (active.cancelled || result.signal) {
        emit({ ...base, type: "job_cancelled" })
        return
      }
      if (result.error) {
        emit({ ...base, type: "job_failed", code: "cli_error", message: result.error })
        return
      }
      if (result.code !== 0) {
        emit({
          ...base,
          type: "job_failed",
          code: "cli_error",
          message: formatCliError(result.stderr, result.stdout, result.code),
        })
        return
      }

      const output = structuredOutput ?? parseStreamOutput(result.stdout)
      if (output === undefined) {
        emit({
          ...base,
          type: "job_failed",
          code: "empty_output",
          message: "Claude Code returned no structured output.",
        })
        return
      }
      emit({ ...base, type: "job_completed", output })
    } catch (error) {
      if (active.cancelled) {
        emit({ ...base, type: "job_cancelled" })
      } else {
        emit({
          ...base,
          type: "job_failed",
          code: "cli_error",
          message: error instanceof Error ? error.message : "Claude Code job failed.",
        })
      }
    } finally {
      this.#active.delete(job.jobId)
    }
  }
}

type ClaudeStreamBlock = {
  index: number
  id: string
  kind: "reasoning" | "agent_message" | "command_execution" | "dynamic_tool_call"
  name?: string
  text: string
  inputText: string
  input?: unknown
  output?: unknown
  failed?: boolean
}

type ClaudeStreamState = {
  blocks: Map<number, ClaudeStreamBlock>
  blocksById: Map<string, ClaudeStreamBlock>
}

function createClaudeStreamState(): ClaudeStreamState {
  return { blocks: new Map(), blocksById: new Map() }
}

function translateClaudeEvent(
  event: Record<string, unknown>,
  state: ClaudeStreamState,
): ClaudeTranslatedEvent[] {
  if (event.type === "system") {
    return [{ type: "job_progress", stage: "starting" }]
  }

  if (event.type === "stream_event") {
    const inner = asRecord(event.event)
    if (!inner) return []
    const index = asNumber(inner.index)
    const block = index === undefined ? undefined : state.blocks.get(index)

    if (inner.type === "content_block_start") {
      const content = asRecord(inner.content_block)
      if (!content || index === undefined) return []
      const id = asString(content.id) || `claude-block-${index}`
      const blockType = asString(content.type)
      const next: ClaudeStreamBlock = {
        index,
        id,
        kind: blockType === "thinking"
          ? "reasoning"
          : blockType === "tool_use"
            ? claudeToolKind(asString(content.name))
            : "agent_message",
        name: asString(content.name),
        text: asString(content.thinking) || asString(content.text) || "",
        inputText: "",
        input: content.input,
      }
      state.blocks.set(index, next)
      state.blocksById.set(id, next)
      return [claudeItemEvent(next, "item.started", "running")]
    }

    if (inner.type === "content_block_delta" && block) {
      const delta = asRecord(inner.delta)
      if (delta) {
        if (delta.type === "text_delta") block.text += asString(delta.text) || ""
        if (delta.type === "thinking_delta") block.text += asString(delta.thinking) || ""
        if (delta.type === "input_json_delta") block.inputText += asString(delta.partial_json) || ""
      }
      return [claudeItemEvent(block, "item.updated", "running")]
    }

    if (inner.type === "content_block_stop" && block) {
      hydrateClaudeInput(block)
      return [claudeItemEvent(block, "item.completed", block.failed ? "failed" : "completed")]
    }
    return []
  }

  if (event.type === "assistant") {
    const message = asRecord(event.message)
    const content = Array.isArray(message?.content) ? message.content : []
    return content.flatMap((value, index) => {
      const blockValue = asRecord(value)
      if (!blockValue) return []
      const block = state.blocks.get(index) || createClaudeBlockFromMessage(blockValue, index, state)
      if (block.kind === "reasoning") block.text = asString(blockValue.thinking) || block.text
      if (block.kind === "agent_message") block.text = asString(blockValue.text) || block.text
      if (block.kind === "command_execution" || block.kind === "dynamic_tool_call") block.input = blockValue.input ?? block.input
      hydrateClaudeInput(block)
      return [claudeItemEvent(block, "item.completed", "completed")]
    })
  }

  if (event.type === "user") {
    const message = asRecord(event.message)
    const content = Array.isArray(message?.content) ? message.content : []
    return content.flatMap((value) => {
      const result = asRecord(value)
      const toolUseId = asString(result, "tool_use_id")
      if (!result || !toolUseId) return []
      const block = state.blocksById.get(toolUseId)
      if (!block) return []
      block.output = result.content
      block.failed = result.is_error === true
      return [claudeItemEvent(block, "item.completed", block.failed ? "failed" : "completed")]
    })
  }

  if (event.type === "result") {
    return [{ type: "job_usage", usage: normalizeClaudeUsage(event) }]
  }

  return []
}

function createClaudeBlockFromMessage(
  value: Record<string, unknown>,
  index: number,
  state: ClaudeStreamState,
): ClaudeStreamBlock {
  const blockType = asString(value.type)
  const block: ClaudeStreamBlock = {
    index,
    id: asString(value.id) || `claude-block-${index}`,
    kind: blockType === "thinking" ? "reasoning" : blockType === "tool_use" ? claudeToolKind(asString(value.name)) : "agent_message",
    name: asString(value.name),
    text: asString(value.thinking) || asString(value.text) || "",
    inputText: "",
    input: value.input,
  }
  state.blocks.set(index, block)
  state.blocksById.set(block.id, block)
  return block
}

function claudeToolKind(name: string | undefined): ClaudeStreamBlock["kind"] {
  return name?.toLowerCase().includes("bash") || name?.toLowerCase().includes("command")
    ? "command_execution"
    : "dynamic_tool_call"
}

function hydrateClaudeInput(block: ClaudeStreamBlock) {
  if (block.input !== undefined || !block.inputText) return
  try {
    block.input = JSON.parse(block.inputText)
  } catch {
    block.input = block.inputText
  }
}

function claudeItemEvent(
  block: ClaudeStreamBlock,
  eventType: "item.started" | "item.updated" | "item.completed",
  status: "running" | "completed" | "failed",
) {
  const item: Record<string, unknown> = {
    id: block.id,
    type: block.kind,
    status: status === "running" ? "in_progress" : status,
    ...(block.name ? { name: block.name, toolName: block.name } : {}),
    ...(block.text ? { text: block.text } : {}),
    ...(block.input !== undefined ? { input: block.input, arguments: block.input } : {}),
    ...(block.output !== undefined ? { output: block.output, result: block.output } : {}),
  }
  if (block.kind === "command_execution") {
    const input = asRecord(block.input)
    const command = asString(input, "command") || asString(input, "cmd")
    if (command) item.command = command
    if (typeof block.output === "string") item.aggregated_output = block.output
  }
  return {
    type: "job_item",
    eventType,
    itemId: block.id,
    itemType: block.kind,
    itemStatus: status,
    item: boundClaudeItem(item),
  }
}

function normalizeClaudeUsage(event: Record<string, unknown>) {
  const usage = asRecord(event.usage) || asRecord(asRecord(event.message)?.usage) || {}
  return {
    ...usage,
    input_tokens: asNumber(usage, "input_tokens") ?? asNumber(usage, "inputTokens") ?? 0,
    output_tokens: asNumber(usage, "output_tokens") ?? asNumber(usage, "outputTokens") ?? 0,
    reasoning_output_tokens: asNumber(usage, "reasoning_output_tokens") ?? asNumber(usage, "reasoningTokens") ?? 0,
  }
}

function boundClaudeItem(item: Record<string, unknown>) {
  const value = { ...item }
  for (const key of ["text", "output", "aggregated_output"]) {
    const candidate = value[key]
    if (typeof candidate === "string" && candidate.length > 300_000) {
      value[key] = `${candidate.slice(0, 300_000)}\n… output truncated …`
    }
  }
  return value
}

function asRecord(value: unknown, key?: string): Record<string, unknown> | null {
  const candidate = key && value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : value
  return candidate !== null && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : null
}

function asString(value: unknown, key?: string) {
  const record = key ? asRecord(value) : null
  const candidate = key ? record?.[key] : value
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined
}

function asNumber(value: unknown, key?: string) {
  const candidate = key === undefined ? value : asRecord(value)?.[key]
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined
}

function toClaudeEffort(value: string | null | undefined): "low" | "medium" | "high" | "xhigh" | "max" | undefined {
  if (!value || value === "auto") return undefined
  if (value === "extra-high") return "xhigh"
  if (["low", "medium", "high", "xhigh", "max"].includes(value)) {
    return value as "low" | "medium" | "high" | "xhigh" | "max"
  }
  return undefined
}

type ProcessResult = {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  limitExceeded: boolean
  error?: string
}

function waitForProcess(
  child: ClaudeChildProcess,
  onLine: (line: string) => void,
) {
  return new Promise<ProcessResult>((resolve) => {
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let totalBytes = 0
    let limitExceeded = false
    let settled = false
    let stdoutLineBuffer = ""

    const append = (target: Buffer[], chunk: Buffer) => {
      if (limitExceeded) return false
      totalBytes += chunk.byteLength
      if (totalBytes > MAX_MESSAGE_BYTES) {
        limitExceeded = true
        child.kill()
        return false
      }
      target.push(chunk)
      return true
    }

    child.stdout.on("data", (chunk: Buffer) => {
      if (!append(stdout, chunk)) return
      stdoutLineBuffer += chunk.toString("utf8")
      let newlineIndex = stdoutLineBuffer.indexOf("\n")
      while (newlineIndex !== -1) {
        const line = stdoutLineBuffer.slice(0, newlineIndex).replace(/\r$/, "")
        stdoutLineBuffer = stdoutLineBuffer.slice(newlineIndex + 1)
        if (line.trim()) onLine(line)
        newlineIndex = stdoutLineBuffer.indexOf("\n")
      }
    })
    child.stderr.on("data", (chunk: Buffer) => append(stderr, chunk))
    child.once("error", (error) => {
      if (settled) return
      settled = true
      resolve({
        code: null,
        signal: null,
        stdout: "",
        stderr: "",
        limitExceeded,
        error: error.message,
      })
    })
    child.once("close", (code, signal) => {
      if (settled) return
      settled = true
      if (stdoutLineBuffer.trim()) onLine(stdoutLineBuffer.trim())
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        limitExceeded,
      })
    })
  })
}

function parseJsonLine(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value.trim())
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Claude may print a diagnostic line alongside stream-json output.
  }
  return null
}

function parseStreamOutput(value: string): unknown {
  const lines = value.split(/\r?\n/)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    const event = parseJsonLine(line)
    if (!event) continue
    const output = event.structured_output ?? event.structuredOutput
    if (output !== undefined) return output
  }
  return undefined
}

function formatCliError(stderr: string, stdout: string, code: number | null) {
  const stderrDetail = stderr.replace(/\s+/g, " ").trim()
  if (stderrDetail) return stderrDetail.slice(-800)

  const stdoutDetail = stdout.replace(/\s+/g, " ").trim()
  if (stdoutDetail) {
    try {
      const parsed: unknown = JSON.parse(stdout.trim())
      if (parsed !== null && typeof parsed === "object") {
        for (const key of ["result", "error", "message"]) {
          const value = (parsed as Record<string, unknown>)[key]
          if (typeof value === "string" && value.trim()) return value.trim().slice(-800)
        }
      }
    } catch {
      // Fall back to the bounded raw output below.
    }
    return stdoutDetail.slice(-800)
  }

  return `Claude Code exited with status ${code === null ? "unknown" : code}.`
}
