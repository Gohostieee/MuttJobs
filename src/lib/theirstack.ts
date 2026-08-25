import { invoke } from "@tauri-apps/api/core"

import type { ResumeMatchingResult } from "@/lib/resume-matching"

export type TheirStackLocation = {
  id: number
  name: string
  displayName?: string | null
  countryCode?: string | null
  countryName?: string | null
  admin1Name?: string | null
  featureCode?: string | null
  featureName?: string | null
}

export type TheirStackIndustry = {
  companies: number
  description?: string | null
  hierarchy: string
  industry: string
  industryId: number
  jobs: number
  parentId?: number | null
}

export type TheirStackTechnology = {
  category?: string | null
  categorySlug?: string | null
  companies: number
  companiesFoundLastWeek: number
  description?: string | null
  jobs: number
  logo?: string | null
  logoThumbnail?: string | null
  name: string
  oneLiner?: string | null
  parentCategory?: string | null
  parentCategorySlug?: string | null
  slug: string
  type: string
  url?: string | null
}

export type TheirStackKeyword = TheirStackTechnology

export type TheirStackJobLocationFilter = {
  id: number
}

export type TheirStackEmploymentStatus =
  | "full_time"
  | "part_time"
  | "temporary"
  | "internship"
  | "contract"
  | "freelance"
  | "co_founder"
  | "apprenticeship"
  | "seasonal"
  | "volunteer"
  | "other"

export type TheirStackWorkplaceType = "on_site" | "hybrid" | "remote"
export type TheirStackSeniority = "c_level" | "staff" | "senior" | "junior" | "mid_level"
export type TheirStackCompanyType = "recruiting_agency" | "direct_employer" | "all"
export type TheirStackProperty =
  | "company_object.domain"
  | "company_object.linkedin_url"
  | "final_url"
  | "hiring_team"
  | "employment_statuses"

/** Current, non-deprecated filter fields accepted by POST /v1/jobs/search. */
export type TheirStackJobSearchRequest = {
  job_title_or?: string[]
  job_title_not?: string[]
  job_title_pattern_and?: string[]
  job_title_pattern_or?: string[]
  job_title_pattern_not?: string[]
  job_country_code_or?: string[]
  job_country_code_not?: string[]
  posted_at_max_age_days?: number
  posted_at_gte?: string
  posted_at_lte?: string
  discovered_at_max_age_days?: number
  discovered_at_min_age_days?: number
  discovered_at_gte?: string
  discovered_at_lte?: string
  job_description_pattern_or?: string[]
  job_description_pattern_not?: string[]
  job_description_pattern_and?: string[]
  job_description_contains_or?: string[]
  job_description_contains_not?: string[]
  workplace_types_or?: TheirStackWorkplaceType[]
  job_id_or?: number[]
  job_id_not?: number[]
  job_export_key_or?: string[]
  job_seniority_or?: TheirStackSeniority[]
  min_salary_usd?: number
  max_salary_usd?: number
  job_technology_slug_or?: string[]
  job_technology_slug_not?: string[]
  job_technology_slug_and?: string[]
  job_keyword_slug_or?: string[]
  job_keyword_slug_and?: string[]
  job_keyword_slug_not?: string[]
  job_location_or?: TheirStackJobLocationFilter[]
  job_location_not?: TheirStackJobLocationFilter[]
  url_domain_or?: string[]
  url_domain_not?: string[]
  easy_apply?: boolean
  employment_statuses_or?: TheirStackEmploymentStatus[]
  is_closed?: boolean
  closed_at_gte?: string
  closed_at_lte?: string
  property_exists_or?: TheirStackProperty[]
  property_exists_and?: TheirStackProperty[]
  company_name_or?: string[]
  company_name_case_insensitive_or?: string[]
  company_id_or?: string[]
  company_id_not?: string[]
  company_domain_or?: string[]
  company_domain_not?: string[]
  company_name_not?: string[]
  company_name_partial_match_or?: string[]
  company_name_partial_match_not?: string[]
  company_linkedin_url_or?: string[]
  company_description_pattern_or?: string[]
  company_description_pattern_not?: string[]
  company_description_pattern_accent_insensitive?: boolean
  min_revenue_usd?: number
  max_revenue_usd?: number
  min_employee_count?: number
  max_employee_count?: number
  min_employee_count_or_null?: number
  max_employee_count_or_null?: number
  min_funding_usd?: number
  max_funding_usd?: number
  funding_stage_or?: string[]
  industry_id_or?: number[]
  industry_id_not?: number[]
  industry_id_not_or_null?: number[]
  company_tags_or?: string[]
  company_type?: TheirStackCompanyType
  company_investors_or?: string[]
  company_investors_partial_match_or?: string[]
  company_technology_slug_or?: string[]
  company_technology_slug_and?: string[]
  company_technology_slug_not?: string[]
  company_keyword_slug_or?: string[]
  company_keyword_slug_and?: string[]
  company_keyword_slug_not?: string[]
  only_yc_companies?: boolean
  company_location_pattern_or?: string[]
  company_country_code_or?: string[]
  company_country_code_not?: string[]
  company_country_code_not_or_null?: string[]
  company_list_id_or?: number[]
  company_list_id_not?: number[]
  last_funding_round_date_lte?: string
  last_funding_round_date_gte?: string
}

export type TheirStackJobLocation = {
  id: number
  name?: string | null
  displayName?: string | null
  countryCode?: string | null
  countryName?: string | null
  state?: string | null
}

export type TheirStackHiringTeamMember = {
  fullName?: string | null
  role?: string | null
  linkedinUrl?: string | null
}

export type TheirStackJobCompany = {
  logo?: string | null
}

export const applicationStatusValues = [
  "revealed",
  "in_process",
  "applied",
  "interviewing",
  "offer",
  "denied",
  "not_interested",
] as const

export type ApplicationStatus = (typeof applicationStatusValues)[number]

export const defaultApplicationStatus: ApplicationStatus = "revealed"

export type JobPrimaryResume = {
  sourceFileName: string
  jobResumeFileName: string
  selectedAt: string
}

const applicationStatusMetadataByValue: Record<ApplicationStatus, {
  label: string
  description: string
}> = {
  revealed: {
    label: "Saved",
    description: "Roles you have saved to review.",
  },
  in_process: {
    label: "In process",
    description: "Roles where you are preparing your application.",
  },
  applied: {
    label: "Applied",
    description: "Applications you have submitted.",
  },
  interviewing: {
    label: "Interviewing",
    description: "Roles with an active interview process.",
  },
  offer: {
    label: "Offer",
    description: "Roles where you have received an offer.",
  },
  denied: {
    label: "Denied",
    description: "Roles that are no longer moving forward.",
  },
  not_interested: {
    label: "Not interested",
    description: "Roles you have chosen not to pursue.",
  },
}

export const applicationStatusMetadata = applicationStatusValues.map((value) => ({
  value,
  ...applicationStatusMetadataByValue[value],
}))

export function normalizeApplicationStatus(
  status: ApplicationStatus | null | undefined,
): ApplicationStatus {
  return status ?? defaultApplicationStatus
}

export type TheirStackJob = {
  id: number
  jobTitle: string
  applicationStatus?: ApplicationStatus | null
  company?: string | null
  datePosted?: string | null
  discoveredAt?: string | null
  closedAt?: string | null
  url?: string | null
  finalUrl?: string | null
  sourceUrl?: string | null
  description?: string | null
  easyApply?: boolean | null
  seniority?: string | null
  companyObject?: TheirStackJobCompany | null
  country?: string | null
  countryCode?: string | null
  remote?: boolean | null
  hybrid?: boolean | null
  location?: string | null
  longLocation?: string | null
  shortLocation?: string | null
  locations: TheirStackJobLocation[]
  salaryString?: string | null
  minAnnualSalaryUsd?: number | null
  maxAnnualSalaryUsd?: number | null
  avgAnnualSalaryUsd?: number | null
  hiringTeam: TheirStackHiringTeamMember[]
  managerRoles: string[]
  employmentStatuses: string[]
  matchingPhrases: string[]
  technologySlugs: string[]
  keywordSlugs: string[]
  hasBlurredData: boolean
  resumeMatching?: ResumeMatchingResult | null
  primaryResume?: JobPrimaryResume | null
}

export type TheirStackJobSearchResult = {
  jobs: TheirStackJob[]
  page: number
  limit: number
  totalResults?: number | null
}

export const THEIRSTACK_JOB_PAGE_SIZE = 20

export type TheirStackSearchQuery = {
  jobTitle?: string
  description?: string
}

export type TheirStackSavedSearch = {
  id: string
  name: string
  filters: TheirStackJobSearchRequest
  query: TheirStackSearchQuery
  model?: string | null
  reasoningEffort?: string | null
  form?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type TheirStackSearchQueryExpansion = {
  titlePatterns: string[]
  descriptionPatterns: string[]
}

export type TheirStackSearchQueryExpansionOptions = {
  model?: string | null
  reasoningEffort?: string | null
}

export type PostedDateFilter =
  | {
      kind: "relative"
      maxAgeDays: 0 | 1 | 7 | 15 | 30 | 90 | 365
    }
  | {
      kind: "range"
      from: string
      to: string
    }

export type TheirStackPostedDateParams =
  | {
      posted_at_max_age_days: number
      posted_at_gte?: never
      posted_at_lte?: never
    }
  | {
      posted_at_max_age_days?: never
      posted_at_gte: string
      posted_at_lte: string
    }

export function toTheirStackPostedDateParams(
  filter: PostedDateFilter,
): TheirStackPostedDateParams {
  if (filter.kind === "relative") {
    return { posted_at_max_age_days: filter.maxAgeDays }
  }

  return {
    posted_at_gte: filter.from,
    posted_at_lte: filter.to,
  }
}

export const searchTheirStackLocations = (query: string) =>
  invoke<TheirStackLocation[]>("search_their_stack_locations", { query })

export const searchTheirStackIndustries = (query: string) =>
  invoke<TheirStackIndustry[]>("search_their_stack_industries", { query })

export const searchTheirStackTechnologies = (query: string) =>
  invoke<TheirStackTechnology[]>("search_their_stack_technologies", { query })

export const searchTheirStackKeywords = (query: string) =>
  invoke<TheirStackKeyword[]>("search_their_stack_keywords", { query })

/** Ask the local Codex provider to widen natural-language text before search. */
export const expandTheirStackSearchQuery = (
  query: TheirStackSearchQuery,
  options: TheirStackSearchQueryExpansionOptions = {},
) =>
  invoke<TheirStackSearchQueryExpansion>("expand_their_stack_search_query", {
    query: {
      ...query,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
    },
  })

/**
 * Search is deliberately a pipeline entry point. The trusted Rust stage always
 * adds `blur_company_data: true`, applies the fixed page size, and validates
 * the zero-based page before the request can reach TheirStack.
 */
export const searchTheirStackJobs = (
  filters: TheirStackJobSearchRequest,
  page = 0,
) => invoke<TheirStackJobSearchResult>("search_their_stack_jobs", { filters, page })

const normalizeTheirStackJob = (job: TheirStackJob): TheirStackJob => ({
  ...job,
  applicationStatus: normalizeApplicationStatus(job.applicationStatus),
})

export const listSavedTheirStackJobs = () =>
  invoke<TheirStackJob[]>("list_saved_their_stack_jobs").then((jobs) =>
    jobs.map(normalizeTheirStackJob),
  )

export const listSavedTheirStackSearches = () =>
  invoke<TheirStackSavedSearch[]>("list_saved_their_stack_searches")

export const saveTheirStackSearch = (input: {
  name: string
  filters: TheirStackJobSearchRequest
  query: TheirStackSearchQuery
  model?: string | null
  reasoningEffort?: string | null
  form?: Record<string, unknown> | null
}) =>
  invoke<TheirStackSavedSearch>("save_their_stack_search", input)

export const deleteSavedTheirStackSearch = (searchId: string) =>
  invoke<void>("delete_saved_their_stack_search", { searchId })

export const updateTheirStackJobStatus = (jobId: number, status: ApplicationStatus) =>
  invoke<void>("update_their_stack_job_status", { jobId, status })

export const setPrimaryResumeForJob = (jobId: number, resumeFileName: string) =>
  invoke<JobPrimaryResume>("set_primary_resume_for_job", { jobId, resumeFileName })

/** Revealing is isolated from search so spending a credit is always a row action. */
export const revealTheirStackJob = (jobId: number, datePosted: string) =>
  invoke<TheirStackJob>("reveal_their_stack_job", { jobId, datePosted }).then(
    normalizeTheirStackJob,
  )
