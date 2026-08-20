import { STANDARD_SECTION_KEYS } from "@/lib/resume-defaults"
import type { AnyResumeItem, RenderableSection, ResumeData, ResumeSectionAlignment, SectionType } from "@/lib/resume-types"

export type ResumeSectionStatus = "active" | "hidden" | "removed"
export type ResumeSectionLane = "main" | "sidebar"
export type ResumeSectionItemDropPosition = "before" | "after"
export const MAX_RESUME_SECTION_COLUMNS = 6

export type ResumeSectionItemEntry = {
  id: string
  index: number
  title: string
  detail: string
  hidden: boolean
}

export type ResumeSectionOption = {
  key: string
  title: string
  type: SectionType
  custom: boolean
  status: ResumeSectionStatus
}

type StandardSectionDefinition = {
  key: "summary" | (typeof STANDARD_SECTION_KEYS)[number]
  title: string
  type: SectionType
  custom: false
}

const STANDARD_SECTION_TITLES: Record<(typeof STANDARD_SECTION_KEYS)[number], string> = {
  profiles: "Profiles",
  experience: "Experience",
  education: "Education",
  projects: "Projects",
  skills: "Skills",
  languages: "Languages",
  interests: "Interests",
  awards: "Awards",
  certifications: "Certifications",
  publications: "Publications",
  volunteer: "Volunteering",
  references: "References",
}

export const STANDARD_SECTION_DEFINITIONS: StandardSectionDefinition[] = [
  { key: "summary", title: "Summary", type: "summary", custom: false },
  ...STANDARD_SECTION_KEYS.map((key) => ({
    key,
    title: STANDARD_SECTION_TITLES[key],
    type: key,
    custom: false as const,
  })),
]

export function getResumeSectionOptions(resume: ResumeData): ResumeSectionOption[] {
  const standard = STANDARD_SECTION_DEFINITIONS.map((definition) => ({
    ...definition,
    title: getResumeSection(resume, definition.key)?.title || definition.title,
    status: getResumeSectionStatus(resume, definition.key),
  }))
  const custom = resume.customSections.map((section, index) => {
    const key = section.id || `custom-${index}`
    return {
      key,
      title: section.title || `Custom section ${index + 1}`,
      type: section.type,
      custom: true,
      status: getResumeSectionStatus(resume, key),
    }
  })

  return [...standard, ...custom]
}

export function getResumeSection(resume: ResumeData, key: string): RenderableSection | undefined {
  if (key === "summary") return resume.summary

  if (key in resume.sections) {
    return resume.sections[key as keyof ResumeData["sections"]]
  }

  const customIndex = getCustomSectionIndex(resume, key)
  return customIndex >= 0 ? resume.customSections[customIndex] : undefined
}

export function getResumeSectionStatus(resume: ResumeData, key: string): ResumeSectionStatus {
  const section = getResumeSection(resume, key)
  if (!section || !section.enabled) return "removed"
  if (section.hidden) return "hidden"
  return "active"
}

export function isResumeSectionInLayout(resume: ResumeData, key: string) {
  return resume.metadata.layout.pages.some((page) => page.main.includes(key) || page.sidebar.includes(key))
}

export function addResumeSection(resume: ResumeData, key: string, lane: ResumeSectionLane = "main"): ResumeData {
  const section = getResumeSection(resume, key)
  if (!section) return resume

  const pages = clonePages(resume)
  let found = false
  for (const page of pages) {
    for (const lane of ["main", "sidebar"] as const) {
      const keys = page[lane]
      page[lane] = keys.filter((candidate) => {
        if (candidate !== key) return true
        if (found) return false
        found = true
        return true
      })
    }
  }
  if (!found) {
    pages[pages.length - 1][lane].push(key)
    if (lane === "sidebar") pages[pages.length - 1].fullWidth = false
  }

  const next = updateResumeSection(resume, key, (current) => ({
    ...current,
    enabled: true,
    hidden: false,
  }))

  return {
    ...next,
    metadata: {
      ...next.metadata,
      layout: { ...next.metadata.layout, pages },
    },
  }
}

export function removeResumeSection(resume: ResumeData, key: string): ResumeData {
  if (!getResumeSection(resume, key)) return resume

  const pages = clonePages(resume).map((page) => ({
    ...page,
    main: page.main.filter((candidate) => candidate !== key),
    sidebar: page.sidebar.filter((candidate) => candidate !== key),
  }))
  const next = updateResumeSection(resume, key, (section) => ({
    ...section,
    enabled: false,
    hidden: false,
  }))

  return {
    ...next,
    metadata: {
      ...next.metadata,
      layout: { ...next.metadata.layout, pages },
    },
  }
}

export function setResumeSectionHidden(resume: ResumeData, key: string, hidden: boolean): ResumeData {
  if (!getResumeSection(resume, key)) return resume
  return updateResumeSection(resume, key, (section) => ({ ...section, hidden }))
}

export function setResumeSectionColumns(resume: ResumeData, key: string, columns: number): ResumeData {
  const section = getResumeSection(resume, key)
  if (!section?.items) return resume

  const nextColumns = Math.round(Math.min(MAX_RESUME_SECTION_COLUMNS, Math.max(1, columns)))
  if (section.columns === nextColumns) return resume
  return updateResumeSection(resume, key, (current) => ({ ...current, columns: nextColumns }))
}

export function setResumeSectionTextAlignment(resume: ResumeData, key: string, alignment: ResumeSectionAlignment): ResumeData {
  const section = getResumeSection(resume, key)
  if (!section?.items || section.alignment === alignment) return resume
  return updateResumeSection(resume, key, (current) => ({ ...current, alignment }))
}

export function setResumeSectionPageAlignment(resume: ResumeData, key: string, pageAlignment: ResumeSectionAlignment): ResumeData {
  const section = getResumeSection(resume, key)
  if (!section?.items || section.pageAlignment === pageAlignment) return resume
  return updateResumeSection(resume, key, (current) => ({ ...current, pageAlignment }))
}

export function getResumeSectionItemEntries(resume: ResumeData, key: string): ResumeSectionItemEntry[] {
  const section = getResumeSection(resume, key)
  if (!section?.items) return []

  const type = getResumeSectionType(resume, key)
  return section.items.map((item, index) => {
    const record = item as unknown as Record<string, unknown>
    return {
      id: item.id || `item-${index + 1}`,
      index,
      title: getItemTitle(record, type) || `New ${getItemTypeLabel(type)}`,
      detail: getItemDetail(record, type) || "No details yet",
      hidden: item.hidden,
    }
  })
}

export function addResumeSectionItem(resume: ResumeData, key: string): ResumeData {
  const section = getResumeSection(resume, key)
  if (!section?.items) return resume

  return updateResumeSection(resume, key, (current) => ({
    ...current,
    enabled: true,
    items: [...(current.items ?? []), createResumeItem(getResumeSectionType(resume, key))],
  }))
}

export function setResumeSectionItems(resume: ResumeData, key: string, items: AnyResumeItem[]): ResumeData {
  const section = getResumeSection(resume, key)
  if (!section?.items) return resume

  return updateResumeSection(resume, key, (current) => ({
    ...current,
    items,
  }))
}

export function updateResumeSectionItem(
  resume: ResumeData,
  key: string,
  itemIndex: number,
  update: (item: AnyResumeItem) => AnyResumeItem,
): ResumeData {
  const section = getResumeSection(resume, key)
  if (!section?.items || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= section.items.length) return resume

  return updateResumeSection(resume, key, (current) => ({
    ...current,
    items: (current.items ?? []).map((item, index) => index === itemIndex ? update(item) : item),
  }))
}

export function removeResumeSectionItem(resume: ResumeData, key: string, itemIndex: number): ResumeData {
  const section = getResumeSection(resume, key)
  if (!section?.items || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= section.items.length) return resume

  return updateResumeSection(resume, key, (current) => ({
    ...current,
    items: (current.items ?? []).filter((_, index) => index !== itemIndex),
  }))
}

export function setResumeSectionItemHidden(resume: ResumeData, key: string, itemIndex: number, hidden: boolean): ResumeData {
  const section = getResumeSection(resume, key)
  const item = section?.items?.[itemIndex]
  if (!item || item.hidden === hidden) return resume

  return updateResumeSection(resume, key, (current) => ({
    ...current,
    items: (current.items ?? []).map((candidate, index) => index === itemIndex ? { ...candidate, hidden } : candidate),
  }))
}

export function reorderResumeSectionItems(
  resume: ResumeData,
  key: string,
  sourceIndex: number,
  targetIndex: number,
  position: ResumeSectionItemDropPosition,
): ResumeData {
  const section = getResumeSection(resume, key)
  if (!section?.items || sourceIndex === targetIndex) return resume
  if (
    !Number.isInteger(sourceIndex) ||
    !Number.isInteger(targetIndex) ||
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex >= section.items.length ||
    targetIndex >= section.items.length
  ) return resume

  const items = [...section.items]
  const [source] = items.splice(sourceIndex, 1)
  let insertionIndex = targetIndex
  if (sourceIndex < targetIndex) insertionIndex -= 1
  if (position === "after") insertionIndex += 1
  items.splice(insertionIndex, 0, source)

  return updateResumeSection(resume, key, (current) => ({ ...current, items }))
}

function updateResumeSection(
  resume: ResumeData,
  key: string,
  update: (section: RenderableSection) => RenderableSection,
): ResumeData {
  if (key === "summary") {
    return { ...resume, summary: update(resume.summary) as ResumeData["summary"] }
  }

  if (key in resume.sections) {
    const sectionKey = key as keyof ResumeData["sections"]
    return {
      ...resume,
      sections: {
        ...resume.sections,
        [sectionKey]: update(resume.sections[sectionKey]),
      },
    }
  }

  const customIndex = getCustomSectionIndex(resume, key)
  if (customIndex < 0) return resume
  const customSections = [...resume.customSections]
  customSections[customIndex] = update(customSections[customIndex]) as ResumeData["customSections"][number]
  return { ...resume, customSections }
}

function getCustomSectionIndex(resume: ResumeData, key: string) {
  if (key.startsWith("custom-")) {
    const index = Number(key.slice("custom-".length))
    if (Number.isInteger(index) && index >= 0 && resume.customSections[index]) return index
  }
  return resume.customSections.findIndex((section) => section.id === key)
}

function getResumeSectionType(resume: ResumeData, key: string): SectionType {
  if (key === "summary") return "summary"
  if (key in resume.sections) return key as SectionType

  const customIndex = getCustomSectionIndex(resume, key)
  return customIndex >= 0 ? resume.customSections[customIndex].type : "summary"
}

function createResumeItem(type: SectionType): AnyResumeItem {
  const base = { id: createResumeItemId(type), hidden: false }
  const website = { url: "", label: "", inlineLink: false }

  switch (type) {
    case "summary": return { ...base, content: "" }
    case "cover-letter": return { ...base, recipient: "", content: "" }
    case "profiles": return { ...base, icon: "", iconColor: "", network: "", username: "", website }
    case "experience": return { ...base, company: "", position: "", location: "", period: "", website, description: "", roles: [] }
    case "education": return { ...base, school: "", degree: "", area: "", grade: "", location: "", period: "", website, description: "" }
    case "projects": return { ...base, name: "", period: "", website, description: "" }
    case "skills": return { ...base, icon: "", iconColor: "", name: "", proficiency: "", level: 0, keywords: [] }
    case "languages": return { ...base, language: "", fluency: "", level: 0 }
    case "interests": return { ...base, icon: "", iconColor: "", name: "", keywords: [] }
    case "awards": return { ...base, title: "", awarder: "", date: "", website, description: "" }
    case "certifications": return { ...base, title: "", issuer: "", date: "", website, description: "" }
    case "publications": return { ...base, title: "", publisher: "", date: "", website, description: "" }
    case "volunteer": return { ...base, organization: "", location: "", period: "", website, description: "" }
    case "references": return { ...base, name: "", position: "", website, phone: "", description: "" }
  }
}

function createResumeItemId(type: SectionType) {
  const prefix = `${type}-item`
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getItemTitle(record: Record<string, unknown>, type: SectionType) {
  switch (type) {
    case "profiles": return firstText(record.network, record.username)
    case "experience": return firstText(record.position, record.company)
    case "education": return firstText(record.school, record.degree)
    case "projects": return firstText(record.name)
    case "skills": return firstText(record.name)
    case "languages": return firstText(record.language)
    case "interests": return firstText(record.name)
    case "awards":
    case "certifications":
    case "publications": return firstText(record.title)
    case "volunteer": return firstText(record.organization)
    case "references": return firstText(record.name)
    case "cover-letter": return firstText(record.recipient, record.content)
    case "summary": return firstText(record.content)
    default: return firstText(record.name, record.title, record.position, record.organization, record.company)
  }
}

function getItemDetail(record: Record<string, unknown>, type: SectionType) {
  const website = record.website && typeof record.website === "object" ? record.website as Record<string, unknown> : undefined
  const keywords = Array.isArray(record.keywords) ? record.keywords.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : []

  switch (type) {
    case "profiles": return firstText(record.username, website?.label, website?.url)
    case "experience": return compactText(record.company, record.period, record.location)
    case "education": return compactText(record.degree, record.area, record.period, record.location)
    case "projects": return compactText(record.period)
    case "skills": return firstText(record.proficiency, keywords.join(", "))
    case "languages": return firstText(record.fluency, typeof record.level === "number" ? `Level ${record.level}/5` : "")
    case "interests": return firstText(keywords.join(", "))
    case "awards": return compactText(record.awarder, record.date)
    case "certifications": return compactText(record.issuer, record.date)
    case "publications": return compactText(record.publisher, record.date)
    case "volunteer": return compactText(record.period, record.location)
    case "references": return compactText(record.position, record.phone)
    case "cover-letter":
    case "summary": return firstText(record.content)
    default: return compactText(record.period, record.location, record.description)
  }
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue
    const text = stripMarkup(value)
    if (text) return text
  }
  return ""
}

function compactText(...values: unknown[]) {
  return values.map((value) => typeof value === "string" ? stripMarkup(value) : "").filter(Boolean).join(" · ")
}

function stripMarkup(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function getItemTypeLabel(type: SectionType) {
  const labels: Partial<Record<SectionType, string>> = {
    "cover-letter": "cover letter entry",
    profiles: "profile",
    volunteer: "volunteer entry",
  }
  return labels[type] || `${type} entry`
}

function clonePages(resume: ResumeData) {
  const pages = resume.metadata.layout.pages.map((page) => ({
    ...page,
    main: [...page.main],
    sidebar: [...page.sidebar],
  }))
  return pages.length ? pages : [{ fullWidth: true, main: [], sidebar: [] }]
}
