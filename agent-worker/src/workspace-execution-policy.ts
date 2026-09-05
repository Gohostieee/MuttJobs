import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/** Analysis receives its complete input directly; unrelated tools are not needed. */
export function workspaceExecutionConfig(): Record<string, string | boolean> {
  const config: Record<string, string | boolean> = {
    "features.shell_tool": false,
    "features.unified_exec": false,
    "features.plugins": false,
    "features.remote_plugin": false,
    "features.apps": false,
    "features.memories": false,
    "features.hooks": false,
    "features.multi_agent": false,
    "features.multi_agent_v2": false,
    "features.view_image": false,
    "features.skill_search": false,
    "features.workspace_dependencies": false,
  }
  // Only read server identifiers, never credentials or environment values.
  // Disabling plugins also excludes plugin-owned MCP servers.
  let contents = ""
  try {
    contents = readFileSync(
      join(process.env.CODEX_HOME || join(homedir(), ".codex"), "config.toml"),
      "utf8",
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("mcp_servers"))
      continue
    const match = trimmed.match(
      /^\[mcp_servers\.(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([a-zA-Z0-9_-]+))(?:\.[a-zA-Z0-9_-]+)*\]\s*(?:#.*)?$/,
    )
    if (!match)
      throw new Error(
        "Job analysis cannot isolate an unfamiliar MCP configuration. Use standard [mcp_servers.name] sections for this operation.",
      )
    const name = match[1] || match[2] || match[3]
    if (!/^[a-zA-Z0-9_-]+$/.test(name))
      throw new Error(
        "Job analysis cannot safely disable a configured MCP server with a nonstandard identifier.",
      )
    config[`mcp_servers.${name}.enabled`] = false
  }
  return config
}
