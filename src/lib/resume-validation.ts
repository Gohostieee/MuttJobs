import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020"

import { normalizeResume } from "@/lib/resume-defaults"
import { resumeSchema } from "@/lib/resume-schema"
import type { ResumeData } from "@/lib/resume-types"

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validator = ajv.compile(resumeSchema) as ValidateFunction<ResumeData>

export function isResumeData(value: unknown): value is ResumeData {
  return validator(value) as boolean
}

export function normalizeAndValidateResume(value: unknown): ResumeData {
  const normalized = normalizeResume(value)
  if (!validator(normalized)) {
    throw new Error(formatValidationErrors(validator.errors))
  }
  return normalized
}

export function formatValidationErrors(errors: ErrorObject[] | null | undefined) {
  if (!errors?.length) return "Resume does not match the JSON schema."
  return errors
    .slice(0, 4)
    .map((error) => `${error.instancePath || "resume"} ${error.message || "is invalid"}`)
    .join("; ")
}

