import type { Template } from "@/lib/resume-types"

export const RESUME_TEMPLATES = ["cyndaquil", "mewtwo"] as const satisfies readonly Template[]

export const RESUME_TEMPLATE_OPTIONS: Array<{ value: Template; label: string; detail: string }> = [
  { value: "cyndaquil", label: "Cyndaquil", detail: "The existing MuttJobs resume layout" },
  { value: "mewtwo", label: "Mewtwo", detail: "A clean academic single-column layout" },
]

const LEGACY_TEMPLATE_IDS = new Set([
  "azurill",
  "bronzor",
  "chikorita",
  "ditgar",
  "ditto",
  "gengar",
  "glalie",
  "kakuna",
  "lapras",
  "leafish",
  "meowth",
  "onyx",
  "pikachu",
  "rhyhorn",
  "scizor",
])

export function normalizeResumeTemplate(value: unknown, fallback: Template = "cyndaquil"): Template {
  if (value === "cyndaquil" || value === "mewtwo") return value
  if (typeof value === "string" && LEGACY_TEMPLATE_IDS.has(value)) return "cyndaquil"
  return fallback
}
