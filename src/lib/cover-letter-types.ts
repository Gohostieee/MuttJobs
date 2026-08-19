import type { TypographyItem } from "@/lib/resume-types"

export type CoverLetterAddress = {
  street?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
}

export type CoverLetterPage = {
  format: "a4" | "letter"
  marginX: number
  marginY: number
}

export type CoverLetterMetadata = {
  date: string
  page: CoverLetterPage
  typography: CoverLetterTypography
}

export type CoverLetterTypography = {
  body: TypographyItem
  heading: TypographyItem
}

export type CoverLetterApplicant = {
  name: string
  email?: string
  phone?: string
  address?: CoverLetterAddress
}

export type CoverLetterRecipient = {
  name?: string | null
  title?: string | null
  company: string
  address?: CoverLetterAddress
  salutation: string
}

export type CoverLetterPosition = {
  title: string
  source?: string | null
}

export type CoverLetterData = {
  metadata: CoverLetterMetadata
  applicant: CoverLetterApplicant
  recipient: CoverLetterRecipient
  position: CoverLetterPosition
  content: {
    opening: string
    body: string[]
    closingParagraph: string
  }
  closing: {
    signOff: string
    name: string
  }
}

export type CoverLetterFile = {
  id: string
  fileName: string
  path: string
  updatedAt: number
  data: CoverLetterData
}
