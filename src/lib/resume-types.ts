export type ResumeWebsite = {
  url: string
  label: string
}

export type ResumeItemWebsite = ResumeWebsite & {
  inlineLink: boolean
}

export type Icon = string
export type IconColor = string

export type Picture = {
  hidden: boolean
  url: string
  size: number
  rotation: number
  aspectRatio: number
  borderRadius: number
  borderColor: string
  borderWidth: number
  shadowColor: string
  shadowWidth: number
}

export type CustomField = {
  id: string
  icon: Icon
  text: string
  link: string
}

export type Basics = {
  name: string
  headline: string
  email: string
  phone: string
  location: string
  website: ResumeWebsite
  customFields: CustomField[]
}

export type BaseSection = {
  title: string
  icon: string
  columns: number
  enabled: boolean
  hidden: boolean
  keepTogether: boolean
  startOnNewPage: boolean
}

export type SummarySection = BaseSection & {
  content: string
}

export type ItemBase = {
  id: string
  hidden: boolean
}

export type Role = {
  id: string
  position: string
  period: string
  description: string
}

export type SummaryItem = ItemBase & {
  content: string
}

export type CoverLetterItem = ItemBase & {
  recipient: string
  content: string
}

export type AwardItem = ItemBase & {
  title: string
  awarder: string
  date: string
  website: ResumeItemWebsite
  description: string
}

export type CertificationItem = ItemBase & {
  title: string
  issuer: string
  date: string
  website: ResumeItemWebsite
  description: string
}

export type EducationItem = ItemBase & {
  school: string
  degree: string
  area: string
  grade: string
  location: string
  period: string
  website: ResumeItemWebsite
  description: string
}

export type ExperienceItem = ItemBase & {
  company: string
  position: string
  location: string
  period: string
  website: ResumeItemWebsite
  description: string
  roles: Role[]
}

export type InterestItem = ItemBase & {
  icon: Icon
  iconColor: IconColor
  name: string
  keywords: string[]
}

export type LanguageItem = ItemBase & {
  language: string
  fluency: string
  level: number
}

export type ProfileItem = ItemBase & {
  icon: Icon
  iconColor: IconColor
  network: string
  username: string
  website: ResumeItemWebsite
}

export type ProjectItem = ItemBase & {
  name: string
  period: string
  website: ResumeItemWebsite
  description: string
}

export type PublicationItem = ItemBase & {
  title: string
  publisher: string
  date: string
  website: ResumeItemWebsite
  description: string
}

export type ReferenceItem = ItemBase & {
  name: string
  position: string
  website: ResumeItemWebsite
  phone: string
  description: string
}

export type SkillItem = ItemBase & {
  icon: Icon
  iconColor: IconColor
  name: string
  proficiency: string
  level: number
  keywords: string[]
}

export type VolunteerItem = ItemBase & {
  organization: string
  location: string
  period: string
  website: ResumeItemWebsite
  description: string
}

export type AnyResumeItem =
  | CoverLetterItem
  | SummaryItem
  | AwardItem
  | CertificationItem
  | EducationItem
  | ExperienceItem
  | InterestItem
  | LanguageItem
  | ProfileItem
  | ProjectItem
  | PublicationItem
  | ReferenceItem
  | SkillItem
  | VolunteerItem

export type SectionWithItems<T extends AnyResumeItem> = BaseSection & {
  items: T[]
}

export type ProfilesSection = SectionWithItems<ProfileItem>
export type ExperienceSection = SectionWithItems<ExperienceItem>
export type EducationSection = SectionWithItems<EducationItem>
export type ProjectsSection = SectionWithItems<ProjectItem>
export type SkillsSection = SectionWithItems<SkillItem>
export type LanguagesSection = SectionWithItems<LanguageItem>
export type InterestsSection = SectionWithItems<InterestItem>
export type AwardsSection = SectionWithItems<AwardItem>
export type CertificationsSection = SectionWithItems<CertificationItem>
export type PublicationsSection = SectionWithItems<PublicationItem>
export type VolunteerSection = SectionWithItems<VolunteerItem>
export type ReferencesSection = SectionWithItems<ReferenceItem>

export type SectionType =
  | "summary"
  | "profiles"
  | "experience"
  | "education"
  | "projects"
  | "skills"
  | "languages"
  | "interests"
  | "awards"
  | "certifications"
  | "publications"
  | "volunteer"
  | "references"
  | "cover-letter"

export type CustomSectionItem = AnyResumeItem

export type CustomSection = BaseSection & {
  id: string
  type: SectionType
  items: CustomSectionItem[]
}

export type Sections = {
  profiles: ProfilesSection
  experience: ExperienceSection
  education: EducationSection
  projects: ProjectsSection
  skills: SkillsSection
  languages: LanguagesSection
  interests: InterestsSection
  awards: AwardsSection
  certifications: CertificationsSection
  publications: PublicationsSection
  volunteer: VolunteerSection
  references: ReferencesSection
}

export type FontWeight = "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900"

export type TypographyItem = {
  fontFamily: string
  fontWeights: FontWeight[]
  fontSize: number
  lineHeight: number
}

export type PageLayout = {
  fullWidth: boolean
  main: string[]
  sidebar: string[]
}

export type Layout = {
  sidebarWidth: number
  pages: PageLayout[]
}

export type Page = {
  gapX: number
  gapY: number
  marginX: number
  marginY: number
  format: "a4" | "letter" | "free-form"
  locale: string
  hideLinkUnderline: boolean
  hideIcons: boolean
  hideSectionIcons: boolean
}

export type Level = {
  icon: Icon
  type: "hidden" | "circle" | "square" | "rectangle" | "rectangle-full" | "progress-bar" | "icon"
}

export type Colors = {
  primary: string
  text: string
  background: string
}

export type Design = {
  level: Level
  colors: Colors
}

export type Typography = {
  body: TypographyItem
  heading: TypographyItem
}

export type Template =
  | "azurill"
  | "bronzor"
  | "chikorita"
  | "ditgar"
  | "ditto"
  | "gengar"
  | "glalie"
  | "kakuna"
  | "lapras"
  | "leafish"
  | "meowth"
  | "onyx"
  | "pikachu"
  | "rhyhorn"
  | "scizor"

export type Metadata = {
  template: Template
  layout: Layout
  page: Page
  design: Design
  typography: Typography
  notes: string
  // styleRules intentionally has no JSON-Schema type constraint.
  styleRules: unknown
}

export type ResumeData = {
  picture: Picture
  basics: Basics
  summary: SummarySection
  sections: Sections
  customSections: CustomSection[]
  metadata: Metadata
  [key: string]: unknown
}

export type ResumeFile = {
  id: string
  fileName: string
  path: string
  updatedAt: number
  data: ResumeData
}

export type RenderableSection = BaseSection & {
  content?: string
  items?: AnyResumeItem[]
}
