import type {
  AnyResumeItem,
  AwardItem,
  Basics,
  CertificationItem,
  Colors,
  CustomField,
  CustomSection,
  EducationItem,
  ExperienceItem,
  FontWeight,
  InterestItem,
  LanguageItem,
  Layout,
  Metadata,
  Page,
  PageLayout,
  Picture,
  ProfileItem,
  ProjectItem,
  PublicationItem,
  ReferenceItem,
  ResumeData,
  ResumeItemWebsite,
  Role,
  Sections,
  SkillItem,
  SummaryItem,
  SummarySection,
  Template,
  Typography,
  TypographyItem,
  VolunteerItem,
} from "@/lib/resume-types"
import { sanitizeRichTextHtml } from "@/lib/rich-text"

type UnknownRecord = Record<string, unknown>

const SECTION_KEYS = [
  "profiles",
  "experience",
  "education",
  "projects",
  "skills",
  "languages",
  "interests",
  "awards",
  "certifications",
  "publications",
  "volunteer",
  "references",
] as const

export { SECTION_KEYS as STANDARD_SECTION_KEYS }

type StandardSectionKey = (typeof SECTION_KEYS)[number]

const TEMPLATES: Template[] = [
  "azurill", "bronzor", "chikorita", "ditgar", "ditto", "gengar", "glalie", "kakuna", "lapras", "leafish", "meowth", "onyx", "pikachu", "rhyhorn", "scizor",
]

const LEVEL_TYPES = ["hidden", "circle", "square", "rectangle", "rectangle-full", "progress-bar", "icon"] as const

export function createEmptyResume(name = ""): ResumeData {
  return {
    picture: createPicture(),
    basics: {
      name,
      headline: "",
      email: "",
      phone: "",
      location: "",
      website: { url: "", label: "" },
      customFields: [],
    },
    summary: createSummarySection(),
    sections: createSections(),
    customSections: [],
    metadata: createMetadata(),
  }
}

export function normalizeResume(input: unknown): ResumeData {
  const source = asRecord(input)
  const defaults = createEmptyResume()
  const sourceSections = asRecord(source.sections)
  const knownKeys = new Set(["picture", "basics", "summary", "sections", "customSections", "metadata"])
  const normalized: ResumeData = {
    picture: normalizePicture(source.picture, defaults.picture),
    basics: normalizeBasics(source.basics, defaults.basics),
    summary: normalizeSummarySection(source.summary, defaults.summary),
    sections: normalizeSections(sourceSections, defaults.sections),
    customSections: arrayValue(source.customSections).map((item, index) => normalizeCustomSection(item, index)),
    metadata: normalizeMetadata(source.metadata, defaults.metadata),
  }

  // The root schema explicitly permits additional properties. Preserve them while
  // keeping nested objects strict and predictable.
  for (const [key, value] of Object.entries(source)) {
    if (!knownKeys.has(key)) normalized[key] = value
  }

  return normalized
}

function createPicture(): Picture {
  return {
    hidden: true,
    url: "",
    size: 64,
    rotation: 0,
    aspectRatio: 1,
    borderRadius: 0,
    borderColor: "rgba(0, 0, 0, 0)",
    borderWidth: 0,
    shadowColor: "rgba(0, 0, 0, 0.5)",
    shadowWidth: 0,
  }
}

function createSummarySection(): SummarySection {
  return { ...createBaseSection("Summary", true), content: "" }
}

function createBaseSection(title: string, enabled = false) {
  return {
    title,
    icon: "",
    columns: 1,
    enabled,
    hidden: false,
    keepTogether: false,
    startOnNewPage: false,
  }
}

function createSections(): Sections {
  return {
    profiles: { ...createBaseSection("Profiles"), items: [] },
    experience: { ...createBaseSection("Experience"), items: [] },
    education: { ...createBaseSection("Education"), items: [] },
    projects: { ...createBaseSection("Projects"), items: [] },
    skills: { ...createBaseSection("Skills"), items: [] },
    languages: { ...createBaseSection("Languages"), items: [] },
    interests: { ...createBaseSection("Interests"), items: [] },
    awards: { ...createBaseSection("Awards"), items: [] },
    certifications: { ...createBaseSection("Certifications"), items: [] },
    publications: { ...createBaseSection("Publications"), items: [] },
    volunteer: { ...createBaseSection("Volunteering"), items: [] },
    references: { ...createBaseSection("References"), items: [] },
  }
}

function createMetadata(): Metadata {
  const page: Page = {
    gapX: 4,
    gapY: 6,
    marginX: 18,
    marginY: 18,
    format: "a4",
    locale: "en-US",
    hideLinkUnderline: false,
    hideIcons: false,
    hideSectionIcons: true,
  }
  const layout: Layout = {
    sidebarWidth: 35,
    pages: [{ fullWidth: true, main: ["summary"], sidebar: [] }],
  }
  const colors: Colors = { primary: "#315c50", text: "#1e2825", background: "#ffffff" }
  const body: TypographyItem = { fontFamily: "Georgia", fontWeights: ["400"], fontSize: 11, lineHeight: 1.5 }
  const heading: TypographyItem = { fontFamily: "Georgia", fontWeights: ["600"], fontSize: 13, lineHeight: 1.5 }
  const typography: Typography = { body, heading }
  return {
    template: "onyx",
    layout,
    page,
    design: { level: { icon: "circle", type: "circle" }, colors },
    typography,
    notes: "",
    styleRules: [],
  }
}

function normalizePicture(value: unknown, fallback: Picture): Picture {
  const source = asRecord(value)
  return {
    hidden: booleanValue(source.hidden, fallback.hidden),
    url: stringValue(source.url, fallback.url),
    size: clamp(numberValue(source.size, fallback.size), 32, 512),
    rotation: clamp(numberValue(source.rotation, fallback.rotation), 0, 360),
    aspectRatio: clamp(numberValue(source.aspectRatio, fallback.aspectRatio), 0.5, 2.5),
    borderRadius: clamp(numberValue(source.borderRadius, fallback.borderRadius), 0, 100),
    borderColor: stringValue(source.borderColor, fallback.borderColor),
    borderWidth: Math.max(0, numberValue(source.borderWidth, fallback.borderWidth)),
    shadowColor: stringValue(source.shadowColor, fallback.shadowColor),
    shadowWidth: Math.max(0, numberValue(source.shadowWidth, fallback.shadowWidth)),
  }
}

function normalizeBasics(value: unknown, fallback: Basics): Basics {
  const source = asRecord(value)
  return {
    name: stringValue(source.name, fallback.name),
    headline: stringValue(source.headline, fallback.headline),
    email: stringValue(source.email, fallback.email),
    phone: stringValue(source.phone, fallback.phone),
    location: stringValue(source.location, fallback.location),
    website: normalizeWebsite(source.website, fallback.website),
    customFields: arrayValue(source.customFields).map((item, index) => normalizeCustomField(item, index)),
  }
}

function normalizeCustomField(value: unknown, index: number): CustomField {
  const source = asRecord(value)
  // Migrate the early prototype shape ({ name, value }) into the schema shape.
  return {
    id: stringValue(source.id, `custom-field-${index + 1}`),
    icon: stringValue(source.icon),
    text: stringValue(source.text, stringValue(source.value, stringValue(source.name))),
    link: stringValue(source.link),
  }
}

function normalizeWebsite(value: unknown, fallback: { url: string; label: string }) {
  const source = asRecord(value)
  return {
    url: stringValue(source.url, fallback.url),
    label: stringValue(source.label, fallback.label),
  }
}

function normalizeItemWebsite(value: unknown): ResumeItemWebsite {
  const source = asRecord(value)
  return {
    url: stringValue(source.url),
    label: stringValue(source.label),
    inlineLink: booleanValue(source.inlineLink, false),
  }
}

function normalizeSummarySection(value: unknown, fallback: SummarySection): SummarySection {
  const source = asRecord(value)
  return {
    ...normalizeBaseSection(source, fallback),
    content: richTextValue(source.content, fallback.content),
  }
}

function normalizeSections(source: UnknownRecord, fallback: Sections): Sections {
  return {
    profiles: normalizeStandardSection("profiles", source.profiles, fallback.profiles),
    experience: normalizeStandardSection("experience", source.experience, fallback.experience),
    education: normalizeStandardSection("education", source.education, fallback.education),
    projects: normalizeStandardSection("projects", source.projects, fallback.projects),
    skills: normalizeStandardSection("skills", source.skills, fallback.skills),
    languages: normalizeStandardSection("languages", source.languages, fallback.languages),
    interests: normalizeStandardSection("interests", source.interests, fallback.interests),
    awards: normalizeStandardSection("awards", source.awards, fallback.awards),
    certifications: normalizeStandardSection("certifications", source.certifications, fallback.certifications),
    publications: normalizeStandardSection("publications", source.publications, fallback.publications),
    volunteer: normalizeStandardSection("volunteer", source.volunteer, fallback.volunteer),
    references: normalizeStandardSection("references", source.references, fallback.references),
  }
}

function normalizeStandardSection<K extends StandardSectionKey>(key: K, value: unknown, fallback: Sections[K]): Sections[K] {
  const source = asRecord(value)
  const items = arrayValue(source.items).map((item, index) => normalizeItemForKind(key, item, index))
  const base = normalizeBaseSection(source, {
    ...fallback,
    enabled: "enabled" in source ? fallback.enabled : hasSectionContent(source, items, fallback.title),
  })
  return { ...base, items } as Sections[K]
}

function normalizeBaseSection(value: UnknownRecord, fallback: { title: string; icon: string; columns: number; enabled: boolean; hidden: boolean; keepTogether: boolean; startOnNewPage: boolean }) {
  return {
    title: stringValue(value.title, fallback.title),
    icon: stringValue(value.icon, fallback.icon),
    columns: Math.round(clamp(numberValue(value.columns, fallback.columns), 1, 6)),
    enabled: booleanValue(value.enabled, fallback.enabled),
    hidden: booleanValue(value.hidden, fallback.hidden),
    keepTogether: booleanValue(value.keepTogether, fallback.keepTogether),
    startOnNewPage: booleanValue(value.startOnNewPage, fallback.startOnNewPage),
  }
}

function normalizeCustomSection(value: unknown, index: number): CustomSection {
  const source = asRecord(value)
  const fallback = createBaseSection(`Custom section ${index + 1}`, true)
  const type = normalizeSectionType(source.type)
  return {
    ...normalizeBaseSection(source, fallback),
    id: stringValue(source.id, `custom-section-${index + 1}`),
    type,
    items: arrayValue(source.items).map((item, itemIndex) => normalizeCustomItem(item, type, itemIndex)),
  }
}

function hasSectionContent(source: UnknownRecord, items: AnyResumeItem[], defaultTitle: string) {
  if (typeof source.title === "string" && source.title.trim() && source.title.trim() !== defaultTitle) return true
  return items.some((item) => !item.hidden && hasDisplayValue(item))
}

function hasDisplayValue(value: unknown): boolean {
  if (typeof value === "string") return Boolean(value.trim())
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.some(hasDisplayValue)
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, nestedValue]) => {
      if (["id", "hidden", "iconColor", "inlineLink"].includes(key)) return false
      return hasDisplayValue(nestedValue)
    })
  }
  return false
}

function normalizeCustomItem(value: unknown, type: string, index: number): AnyResumeItem {
  const source = asRecord(value)
  if ("recipient" in source) return normalizeCoverLetterItem(source, index)
  if ("network" in source) return normalizeProfileItem(source, index)
  if ("company" in source) return normalizeExperienceItem(source, index)
  if ("school" in source) return normalizeEducationItem(source, index)
  if ("organization" in source) return normalizeVolunteerItem(source, index)
  if ("language" in source) return normalizeLanguageItem(source, index)
  if ("proficiency" in source) return normalizeSkillItem(source, index)
  if ("awarder" in source) return normalizeAwardItem(source, index)
  if ("issuer" in source) return normalizeCertificationItem(source, index)
  if ("publisher" in source) return normalizePublicationItem(source, index)
  if ("phone" in source) return normalizeReferenceItem(source, index)
  if ("title" in source) {
    if (type === "certifications") return normalizeCertificationItem(source, index)
    if (type === "publications") return normalizePublicationItem(source, index)
    if (type === "summary") return normalizeSummaryItem(source, index)
    if (type === "cover-letter") return normalizeCoverLetterItem(source, index)
    return normalizeAwardItem(source, index)
  }
  if ("content" in source) return normalizeSummaryItem(source, index)
  if ("name" in source && "period" in source) return normalizeProjectItem(source, index)

  switch (type) {
    case "profiles": return normalizeProfileItem(source, index)
    case "experience": return normalizeExperienceItem(source, index)
    case "education": return normalizeEducationItem(source, index)
    case "projects": return normalizeProjectItem(source, index)
    case "skills": return normalizeSkillItem(source, index)
    case "languages": return normalizeLanguageItem(source, index)
    case "interests": return normalizeInterestItem(source, index)
    case "awards": return normalizeAwardItem(source, index)
    case "certifications": return normalizeCertificationItem(source, index)
    case "publications": return normalizePublicationItem(source, index)
    case "volunteer": return normalizeVolunteerItem(source, index)
    case "references": return normalizeReferenceItem(source, index)
    case "cover-letter": return normalizeCoverLetterItem(source, index)
    default: return normalizeSummaryItem(source, index)
  }
}

function normalizeItemForKind(kind: StandardSectionKey, value: unknown, index: number): AnyResumeItem {
  const source = asRecord(value)
  switch (kind) {
    case "profiles": return normalizeProfileItem(source, index)
    case "experience": return normalizeExperienceItem(source, index)
    case "education": return normalizeEducationItem(source, index)
    case "projects": return normalizeProjectItem(source, index)
    case "skills": return normalizeSkillItem(source, index)
    case "languages": return normalizeLanguageItem(source, index)
    case "interests": return normalizeInterestItem(source, index)
    case "awards": return normalizeAwardItem(source, index)
    case "certifications": return normalizeCertificationItem(source, index)
    case "publications": return normalizePublicationItem(source, index)
    case "volunteer": return normalizeVolunteerItem(source, index)
    case "references": return normalizeReferenceItem(source, index)
  }
}

function itemBase(source: UnknownRecord, index: number) {
  return { id: stringValue(source.id, `item-${index + 1}`), hidden: booleanValue(source.hidden, false) }
}

function normalizeRole(value: unknown, index: number): Role {
  const source = asRecord(value)
  return {
    id: stringValue(source.id, `role-${index + 1}`),
    position: stringValue(source.position, stringValue(source.name)),
    period: stringValue(source.period, stringValue(source.date)),
    description: richTextValue(source.description),
  }
}

function normalizeSummaryItem(source: UnknownRecord, index: number): SummaryItem {
  return { ...itemBase(source, index), content: richTextValue(source.content, stringValue(source.description)) }
}

function normalizeCoverLetterItem(source: UnknownRecord, index: number) {
  return { ...itemBase(source, index), recipient: stringValue(source.recipient), content: richTextValue(source.content, stringValue(source.description)) }
}

function normalizeAwardItem(source: UnknownRecord, index: number): AwardItem {
  return { ...itemBase(source, index), title: nonEmpty(source.title, "Untitled award"), awarder: stringValue(source.awarder), date: stringValue(source.date, stringValue(source.period)), website: normalizeItemWebsite(source.website), description: richTextValue(source.description) }
}

function normalizeCertificationItem(source: UnknownRecord, index: number): CertificationItem {
  return { ...itemBase(source, index), title: nonEmpty(source.title, "Untitled certification"), issuer: stringValue(source.issuer), date: stringValue(source.date, stringValue(source.period)), website: normalizeItemWebsite(source.website), description: richTextValue(source.description) }
}

function normalizeEducationItem(source: UnknownRecord, index: number): EducationItem {
  return { ...itemBase(source, index), school: nonEmpty(source.school, stringValue(source.institution, "Untitled school")), degree: stringValue(source.degree), area: stringValue(source.area), grade: stringValue(source.grade), location: stringValue(source.location), period: stringValue(source.period), website: normalizeItemWebsite(source.website), description: richTextValue(source.description) }
}

function normalizeExperienceItem(source: UnknownRecord, index: number): ExperienceItem {
  return { ...itemBase(source, index), company: nonEmpty(source.company, "Untitled company"), position: stringValue(source.position), location: stringValue(source.location), period: stringValue(source.period), website: normalizeItemWebsite(source.website), description: richTextValue(source.description), roles: arrayValue(source.roles).map(normalizeRole) }
}

function normalizeInterestItem(source: UnknownRecord, index: number): InterestItem {
  return { ...itemBase(source, index), icon: stringValue(source.icon), iconColor: stringValue(source.iconColor), name: nonEmpty(source.name, "Untitled interest"), keywords: stringArray(source.keywords) }
}

function normalizeLanguageItem(source: UnknownRecord, index: number): LanguageItem {
  return { ...itemBase(source, index), language: nonEmpty(source.language, "Untitled language"), fluency: stringValue(source.fluency), level: clamp(numberValue(source.level, 0), 0, 5) }
}

function normalizeProfileItem(source: UnknownRecord, index: number): ProfileItem {
  return { ...itemBase(source, index), icon: stringValue(source.icon), iconColor: stringValue(source.iconColor), network: nonEmpty(source.network, "Profile"), username: stringValue(source.username), website: normalizeItemWebsite(source.website) }
}

function normalizeProjectItem(source: UnknownRecord, index: number): ProjectItem {
  return { ...itemBase(source, index), name: nonEmpty(source.name, "Untitled project"), period: stringValue(source.period), website: normalizeItemWebsite(source.website), description: richTextValue(source.description) }
}

function normalizePublicationItem(source: UnknownRecord, index: number): PublicationItem {
  return { ...itemBase(source, index), title: nonEmpty(source.title, "Untitled publication"), publisher: stringValue(source.publisher), date: stringValue(source.date, stringValue(source.period)), website: normalizeItemWebsite(source.website), description: richTextValue(source.description) }
}

function normalizeReferenceItem(source: UnknownRecord, index: number): ReferenceItem {
  return { ...itemBase(source, index), name: nonEmpty(source.name, "Unnamed reference"), position: stringValue(source.position), website: normalizeItemWebsite(source.website), phone: stringValue(source.phone), description: richTextValue(source.description) }
}

function normalizeSkillItem(source: UnknownRecord, index: number): SkillItem {
  return { ...itemBase(source, index), icon: stringValue(source.icon), iconColor: stringValue(source.iconColor), name: nonEmpty(source.name, "Untitled skill"), proficiency: stringValue(source.proficiency), level: clamp(numberValue(source.level, 0), 0, 5), keywords: stringArray(source.keywords) }
}

function normalizeVolunteerItem(source: UnknownRecord, index: number): VolunteerItem {
  return { ...itemBase(source, index), organization: nonEmpty(source.organization, "Untitled organization"), location: stringValue(source.location), period: stringValue(source.period), website: normalizeItemWebsite(source.website), description: richTextValue(source.description) }
}

function normalizeMetadata(value: unknown, fallback: Metadata): Metadata {
  const source = asRecord(value)
  const pageSource = asRecord(source.page)
  const layoutSource = asRecord(source.layout)
  const designSource = asRecord(source.design)
  const colorSource = asRecord(designSource.colors)
  const levelSource = asRecord(designSource.level)
  const typographySource = asRecord(source.typography)
  return {
    template: TEMPLATES.includes(source.template as Template) ? source.template as Template : fallback.template,
    layout: normalizeLayout(layoutSource, fallback.layout),
    page: {
      gapX: Math.max(0, numberValue(pageSource.gapX, fallback.page.gapX)),
      gapY: Math.max(0, numberValue(pageSource.gapY, fallback.page.gapY)),
      marginX: Math.max(0, numberValue(pageSource.marginX, fallback.page.marginX)),
      marginY: Math.max(0, numberValue(pageSource.marginY, fallback.page.marginY)),
      format: ["a4", "letter", "free-form"].includes(pageSource.format as string) ? pageSource.format as Page["format"] : fallback.page.format,
      locale: stringValue(pageSource.locale, fallback.page.locale),
      hideLinkUnderline: booleanValue(pageSource.hideLinkUnderline, fallback.page.hideLinkUnderline),
      hideIcons: booleanValue(pageSource.hideIcons, fallback.page.hideIcons),
      hideSectionIcons: booleanValue(pageSource.hideSectionIcons, fallback.page.hideSectionIcons),
    },
    design: {
      colors: {
        primary: stringValue(colorSource.primary, fallback.design.colors.primary),
        text: stringValue(colorSource.text, fallback.design.colors.text),
        background: stringValue(colorSource.background, fallback.design.colors.background),
      },
      level: {
        icon: stringValue(levelSource.icon, fallback.design.level.icon),
        type: LEVEL_TYPES.includes(levelSource.type as (typeof LEVEL_TYPES)[number]) ? levelSource.type as Metadata["design"]["level"]["type"] : fallback.design.level.type,
      },
    },
    typography: {
      body: normalizeTypographyItem(asRecord(typographySource.body), fallback.typography.body),
      heading: normalizeTypographyItem(asRecord(typographySource.heading), fallback.typography.heading),
    },
    notes: stringValue(source.notes, fallback.notes),
    styleRules: "styleRules" in source ? source.styleRules : fallback.styleRules,
  }
}

function normalizeLayout(source: UnknownRecord, fallback: Layout): Layout {
  const hasPages = Array.isArray(source.pages)
  const pages = arrayValue(source.pages).map((value, index) => {
    const page = asRecord(value)
    const pageFallback = fallback.pages[index] ?? { fullWidth: true, main: [], sidebar: [] }
    const normalized: PageLayout = {
      fullWidth: booleanValue(page.fullWidth, pageFallback.fullWidth),
      main: stringArray(page.main),
      sidebar: stringArray(page.sidebar),
    }
    return normalized
  })
  return {
    sidebarWidth: clamp(numberValue(source.sidebarWidth, fallback.sidebarWidth), 10, 50),
    pages: hasPages ? pages : fallback.pages,
  }
}

function normalizeTypographyItem(source: UnknownRecord, fallback: TypographyItem): TypographyItem {
  const weights = stringArray(source.fontWeights).filter((weight): weight is FontWeight => ["100", "200", "300", "400", "500", "600", "700", "800", "900"].includes(weight))
  return {
    fontFamily: stringValue(source.fontFamily, fallback.fontFamily),
    fontWeights: weights.length ? weights : fallback.fontWeights,
    fontSize: clamp(numberValue(source.fontSize, fallback.fontSize), 6, 24),
    lineHeight: clamp(numberValue(source.lineHeight, fallback.lineHeight), 0.5, 4),
  }
}

function normalizeSectionType(value: unknown) {
  const types = ["summary", ...SECTION_KEYS, "cover-letter"]
  return types.includes(value as string) ? value as CustomSection["type"] : "summary"
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {}
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringArray(value: unknown): string[] {
  return arrayValue(value).filter((item): item is string => typeof item === "string")
}

function richTextValue(value: unknown, fallback = "") {
  return sanitizeRichTextHtml(stringValue(value, fallback))
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function nonEmpty(value: unknown, fallback: string) {
  const result = stringValue(value).trim()
  return result || fallback
}

function numberValue(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return fallback
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
