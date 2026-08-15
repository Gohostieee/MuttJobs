import { STANDARD_SECTION_KEYS } from "@/lib/resume-defaults"
import type { RenderableSection, ResumeData, SectionType } from "@/lib/resume-types"

export type ResumeSectionStatus = "active" | "hidden" | "removed"

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

export function addResumeSection(resume: ResumeData, key: string): ResumeData {
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
  if (!found) pages[pages.length - 1].main.push(key)

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

function clonePages(resume: ResumeData) {
  const pages = resume.metadata.layout.pages.map((page) => ({
    ...page,
    main: [...page.main],
    sidebar: [...page.sidebar],
  }))
  return pages.length ? pages : [{ fullWidth: true, main: [], sidebar: [] }]
}
