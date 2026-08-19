import { invoke } from "@tauri-apps/api/core"

export type AgentSkill = {
  name: string
  description: string
  path: string
  enabled: boolean
}

export type AgentSkillCatalogError = {
  path?: string
  message: string
}

export type AgentSkillCatalog = {
  skills: AgentSkill[]
  errors: AgentSkillCatalogError[]
}

export type AgentSkillMention = {
  name: string
  start: number
  end: number
}

export type AgentSkillMentionContext = {
  query: string
  start: number
  end: number
}

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SKILL_PARTIAL_PATTERN = /^[a-z0-9-]*$/

export async function loadAgentSkillCatalog(): Promise<AgentSkillCatalog> {
  return invoke<AgentSkillCatalog>("list_agent_skills")
}

export function parseAgentSkillMentions(text: string): AgentSkillMention[] {
  const mentions: AgentSkillMention[] = []
  let cursor = 0

  while (true) {
    const relativeStart = text.indexOf("#(", cursor)
    if (relativeStart === -1) return mentions

    const nameStart = relativeStart + 2
    const relativeEnd = text.indexOf(")", nameStart)
    if (relativeEnd === -1) {
      throw new Error("Malformed local skill mention. Use #(skill-name).")
    }

    const name = text.slice(nameStart, relativeEnd)
    if (!SKILL_NAME_PATTERN.test(name)) {
      throw new Error(`Malformed local skill mention \`#(${name})\`. Use #(skill-name).`)
    }

    mentions.push({ name, start: relativeStart, end: relativeEnd + 1 })
    cursor = relativeEnd + 1
  }
}

export function uniqueAgentSkillNames(mentions: AgentSkillMention[]): string[] {
  return [...new Set(mentions.map((mention) => mention.name))]
}

export function resolveAgentSkillNames(
  mentions: AgentSkillMention[],
  catalog: AgentSkillCatalog,
): string[] {
  const names = uniqueAgentSkillNames(mentions)
  const missing = names.find((name) => catalog.skills.filter((skill) => skill.name === name).length !== 1)
  if (missing) {
    throw new Error(`Local skill \`${missing}\` is not available. Refresh the skill catalog and try again.`)
  }
  return names
}

export function transformAgentSkillMentions(
  text: string,
  mentions: AgentSkillMention[],
): string {
  if (!mentions.length) return text

  let transformed = ""
  let cursor = 0
  for (const mention of mentions) {
    transformed += text.slice(cursor, mention.start)
    transformed += `$${mention.name}`
    cursor = mention.end
  }
  return transformed + text.slice(cursor)
}

export function getAgentSkillMentionAtCaret(
  text: string,
  caret: number,
): AgentSkillMentionContext | null {
  const beforeCaret = text.slice(0, caret)
  const start = beforeCaret.lastIndexOf("#(")
  if (start === -1) return null

  const query = beforeCaret.slice(start + 2)
  if (!SKILL_PARTIAL_PATTERN.test(query)) return null
  const previous = text[start - 1]
  if (previous && /[A-Za-z0-9_]/.test(previous)) return null

  return { query, start, end: caret }
}
