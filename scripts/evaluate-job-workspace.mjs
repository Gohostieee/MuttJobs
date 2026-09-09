// Uses the production worker protocol. Input and output are JSON over stdio.
import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
const input = JSON.parse(readFileSync(0, "utf8"))
const worker = spawn(
  process.execPath,
  [resolve("agent-worker/dist/worker.cjs")],
  { stdio: ["pipe", "pipe", "inherit"], windowsHide: true },
)
const send = (value) =>
  worker.stdin.write(JSON.stringify({ protocolVersion: 4, ...value }) + "\n")
let completed = false
const timer = setTimeout(() => {
  console.error("Evaluation timed out; cancelling the provider job.")
  send({ requestId: "cancel", type: "cancel_job", jobId: "evaluation" })
  setTimeout(() => worker.kill(), 10000).unref()
  process.exitCode = 1
}, Number(process.env.MUTTJOBS_EVAL_TIMEOUT_MS || 600_000))
createInterface({ input: worker.stdout }).on("line", (line) => {
  const event = JSON.parse(line)
  if (["job_thread", "job_progress"].includes(event.type))
    console.error(
      `${new Date().toISOString()} ${event.type} ${event.stage || event.threadId || ""}`,
    )
  if (event.type === "ready" && !event.shuttingDown)
    send({
      requestId: "evaluation",
      type: "start_job",
      job: {
        jobId: "evaluation",
        kind: input.kind || "job_workspace",
        provider: input.provider || "codex",
        workingDirectory: input.root,
        prompt: input.prompt,
        outputSchema: input.schema,
        model: input.model || "gpt-5.6-luna",
        reasoningEffort: input.effort || "max",
        isGitRepository: false,
        execution: {
          sandboxMode: "read-only",
          approvalPolicy: "never",
          networkAccessEnabled: false,
        },
      },
    })
  if (event.type === "job_completed") {
    console.error(`Evaluation result: ${JSON.stringify(event.output).slice(0, 1600)}`)
    completed = true
    process.stdout.write(JSON.stringify(event.output))
    clearTimeout(timer)
    send({ requestId: "shutdown", type: "shutdown" })
  }
  if (["job_failed", "worker_error", "job_cancelled"].includes(event.type)) {
    console.error(event.message || event.type)
    clearTimeout(timer)
    process.exitCode = 1
    worker.kill()
  }
})
worker.on("exit", () => {
  clearTimeout(timer)
  if (!completed) process.exitCode = 1
})
send({
  requestId: "initialize",
  type: "initialize",
  codexPath: process.env.MUTTJOBS_EVAL_CODEX,
  claudePath: process.env.MUTTJOBS_EVAL_CLAUDE,
})
