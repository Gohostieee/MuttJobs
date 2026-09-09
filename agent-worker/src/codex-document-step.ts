import { execFile, spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createInterface } from "node:readline"
import { promisify } from "node:util"
import type { ThreadEvent } from "@openai/codex-sdk"
import type { AgentJobRequest } from "./protocol.js"

const checked = new Map<string, Promise<void>>()
const disabledFeatures = [
  "shell_tool", "unified_exec", "plugins", "remote_plugin", "apps", "memories",
  "hooks", "multi_agent", "multi_agent_v2", "view_image", "skill_search",
  "workspace_dependencies", "in_app_browser", "in_app_local_automation",
  "sleep_tool", "tool_suggest", "context_management", "skill_mcp_dependency_install",
]

async function requireIsolationFlags(executable: string) {
  let check = checked.get(executable)
  if (!check) {
    check = promisify(execFile)(executable, ["exec", "--help"], { windowsHide: true, timeout: 10_000 })
      .then(({ stdout }) => {
        for (const flag of ["--ignore-user-config", "--ignore-rules", "--ephemeral", "--output-schema"]) {
          if (!stdout.includes(flag)) throw new Error(`This Codex installation cannot isolate document creation (${flag} unavailable). Update Codex to create documents.`)
        }
      })
    checked.set(executable, check)
  }
  await check
}

/** One stateless structured turn. Authentication stays in CODEX_HOME; ambient config does not. */
export async function* codexDocumentStep(executable: string, job: AgentJobRequest, signal: AbortSignal): AsyncGenerator<ThreadEvent> {
  await requireIsolationFlags(executable)
  signal.throwIfAborted()
  if (!job.model || !job.reasoningEffort || !["minimal", "low", "medium", "high", "xhigh", "extra-high", "max"].includes(job.reasoningEffort)) {
    throw new Error("Document creation requires an explicit supported model and reasoning effort.")
  }
  const directory = await mkdtemp(join(tmpdir(), "muttjobs-document-step-"))
  const schema = join(directory, "schema.json")
  try {
    await writeFile(schema, JSON.stringify(job.outputSchema))
    const effort = job.reasoningEffort === "extra-high" ? "xhigh" : job.reasoningEffort
    const args = ["exec", "--json", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check",
      "--sandbox", "read-only", "--cd", directory, "--output-schema", schema, "--model", job.model,
      "-c", `model_reasoning_effort=${JSON.stringify(effort)}`, "-c", 'approval_policy="never"',
      "-c", 'web_search="disabled"', "-c", 'developer_instructions=""', "-c", "project_doc_max_bytes=0",
      "-c", "features.skip_host_skill_discovery=true", "-c", "show_raw_agent_reasoning=false",
      ...disabledFeatures.flatMap((name) => ["-c", `features.${name}=false`]), "-"]
    const child = spawn(executable, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
    let stderr = ""
    let size = 0
    let spawnError: Error | undefined
    child.on("error", (error) => { spawnError = error })
    const completion = new Promise<number | null>((resolve) => child.once("close", resolve))
    const abort = () => {
      if (process.platform === "win32" && child.pid) {
        const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
        killer.on("error", () => child.kill())
      } else child.kill()
    }
    signal.addEventListener("abort", abort, { once: true })
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8000) })
    child.stdin.on("error", () => {})
    child.stdin.end(job.prompt)
    try {
      if (signal.aborted) abort()
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
      for await (const line of lines) {
        size += Buffer.byteLength(line)
        if (size > 2 * 1024 * 1024) throw new Error("Document step output exceeded its limit.")
        const event = JSON.parse(line) as ThreadEvent
        if (event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") {
          if (!["agent_message", "reasoning", "error"].includes(event.item.type)) {
            throw new Error(`Document isolation failed: unexpected provider tool ${event.item.type}.`)
          }
        }
        yield event
      }
      const code = await completion
      signal.throwIfAborted()
      if (spawnError) throw spawnError
      if (code !== 0) throw new Error(`Codex document step failed (${code}): ${stderr}`)
    } finally {
      signal.removeEventListener("abort", abort)
      if (child.exitCode === null) abort()
      await completion
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
