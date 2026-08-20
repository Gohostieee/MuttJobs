import { sanitizeRichTextHtml } from "@/lib/rich-text"
import type { CoverLetterAddress, CoverLetterData, CoverLetterPage, CoverLetterTypography } from "@/lib/cover-letter-types"
import type { FontWeight, TypographyItem } from "@/lib/resume-types"

type UnknownRecord = Record<string, unknown>

export function createEmptyCoverLetter(applicantName = ""): CoverLetterData {
  return {
    metadata: { date: localIsoDate(), page: createCoverLetterPage(), typography: createCoverLetterTypography() },
    applicant: { name: applicantName, address: emptyAddress() },
    recipient: {
      name: null,
      title: null,
      company: "",
      address: emptyAddress(),
      salutation: "Dear Hiring Manager:",
    },
    position: { title: "", source: null },
    content: { opening: "", body: [""], closingParagraph: "" },
    closing: { signOff: "Sincerely,", name: applicantName },
  }
}

/**
 * Normalize both the current compact schema and the original, more detailed
 * cover-letter shape. Existing local letters therefore migrate on read/save.
 */
export function normalizeCoverLetter(input: unknown): CoverLetterData {
  const source = record(input)
  const metadata = record(source.metadata)
  const page = record(metadata.page)
  const applicant = record(source.applicant)
  const recipient = record(source.recipient)
  const position = record(source.position)
  const content = record(source.content)
  const closing = record(source.closing)
  const name = stringValue(applicant.name)
  const body = arrayValue(content.body).slice(0, 4).map(paragraphText)

  return {
    metadata: {
      date: dateValue(metadata.date),
      page: normalizeCoverLetterPage(page),
      typography: normalizeCoverLetterTypography(metadata.typography),
    },
    applicant: {
      name,
      ...optionalEmailProperty(applicant.email),
      ...optionalStringProperty("phone", applicant.phone),
      address: normalizeAddress(applicant.address),
    },
    recipient: {
      name: nullableString(recipient.name),
      title: nullableString(recipient.title),
      company: stringValue(recipient.company),
      address: normalizeAddress(recipient.address),
      salutation: stringValue(recipient.salutation, "Dear Hiring Manager:"),
    },
    position: {
      title: stringValue(position.title),
      source: nullableString(position.source),
    },
    content: {
      opening: paragraphText(content.opening),
      body: body.length ? body : [""],
      closingParagraph: paragraphText(content.closingParagraph),
    },
    closing: {
      signOff: stringValue(closing.signOff, "Sincerely,"),
      name: stringValue(closing.name, name),
    },
  }
}

function createCoverLetterPage() {
  return { format: "letter" as const, marginX: 25.4, marginY: 25.4 }
}

function normalizeCoverLetterPage(source: UnknownRecord): CoverLetterPage {
  const fallback = createCoverLetterPage()
  return {
    format: source.format === "a4" || source.format === "letter" ? source.format : fallback.format,
    marginX: clamp(numberValue(source.marginX, fallback.marginX), 0, 60),
    marginY: clamp(numberValue(source.marginY, fallback.marginY), 0, 60),
  }
}

function createCoverLetterTypography(): CoverLetterTypography {
  return {
    body: { fontFamily: "Georgia", fontWeights: ["400"], fontSize: 10, lineHeight: 1.68 },
    heading: { fontFamily: "Arial", fontWeights: ["700"], fontSize: 22, lineHeight: 1.08 },
  }
}

function normalizeCoverLetterTypography(value: unknown): CoverLetterTypography {
  const source = record(value)
  const fallback = createCoverLetterTypography()
  return {
    body: normalizeTypographyItem(source.body, fallback.body),
    heading: normalizeTypographyItem(source.heading, fallback.heading),
  }
}

function normalizeTypographyItem(value: unknown, fallback: TypographyItem): TypographyItem {
  const source = record(value)
  const weights = arrayValue(source.fontWeights).filter((weight): weight is FontWeight => [
    "100", "200", "300", "400", "500", "600", "700", "800", "900",
  ].includes(weight as string))
  return {
    fontFamily: stringValue(source.fontFamily, fallback.fontFamily),
    fontWeights: weights.length ? weights : fallback.fontWeights,
    fontSize: clamp(numberValue(source.fontSize, fallback.fontSize), 6, 24),
    lineHeight: clamp(numberValue(source.lineHeight, fallback.lineHeight), 0.5, 4),
  }
}

function paragraphText(value: unknown) {
  if (typeof value === "string") return sanitizeRichTextHtml(value)
  return sanitizeRichTextHtml(stringValue(record(value).text))
}

function emptyAddress(): CoverLetterAddress {
  return { street: null, street2: null, city: null, state: null, postalCode: null, country: null }
}

function normalizeAddress(value: unknown): CoverLetterAddress {
  const source = record(value)
  return {
    street: nullableString(source.street),
    street2: nullableString(source.street2),
    city: nullableString(source.city),
    state: nullableString(source.state),
    postalCode: nullableString(source.postalCode),
    country: nullableString(source.country),
  }
}

function localIsoDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {}
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function optionalStringProperty<Key extends "phone">(key: Key, value: unknown): Partial<Record<Key, string>> {
  return typeof value === "string" && value.trim() ? { [key]: value } as Record<Key, string> : {}
}

function optionalEmailProperty(value: unknown): Pick<CoverLetterData["applicant"], "email"> | Record<string, never> {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? { email: value } : {}
}

function dateValue(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localIsoDate()
}
