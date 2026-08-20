import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020"

import { normalizeCoverLetter } from "@/lib/cover-letter-defaults"
import { coverLetterSchema } from "@/lib/cover-letter-schema"
import type { CoverLetterData } from "@/lib/cover-letter-types"

const ajv = new Ajv2020({ allErrors: true, strict: false })
ajv.addFormat("date", {
  type: "string",
  validate: (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const [year, month, day] = value.split("-").map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  },
})
ajv.addFormat("email", { type: "string", validate: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) })
const validator = ajv.compile(coverLetterSchema) as ValidateFunction<CoverLetterData>

export function isCoverLetterData(value: unknown): value is CoverLetterData {
  return validator(value) as boolean
}

export function normalizeAndValidateCoverLetter(value: unknown): CoverLetterData {
  const normalized = normalizeCoverLetter(value)
  if (!validator(normalized)) throw new Error(formatCoverLetterValidationErrors(validator.errors))
  return normalized
}

export function formatCoverLetterValidationErrors(errors: ErrorObject[] | null | undefined) {
  if (!errors?.length) return "Cover letter does not match the JSON schema."
  return errors.slice(0, 4).map((error) => `${error.instancePath || "cover letter"} ${error.message || "is invalid"}`).join("; ")
}
