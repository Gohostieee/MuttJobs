import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import type { ResumeAiSelection, ResumeAiStreamEvent } from "@/lib/resume-ai"

export const COMPANY_RESEARCH_AGENT_IDS = [
  "company_identity",
  "company_culture",
  "future_prospects",
  "public_reputation",
  "hiring_intelligence",
] as const

export type ResearchAgentId = (typeof COMPANY_RESEARCH_AGENT_IDS)[number]
export type ResearchRunStatus = "queued" | "running" | "completed" | "completed_with_gaps" | "failed" | "cancelled"
export type AgentRunStatus = "queued" | "running" | "validating" | "completed" | "failed" | "timed_out" | "cancelled"
export type ConfidenceLevel = "high" | "medium" | "low"
export type EvidenceClassification = "verified_fact" | "company_claim" | "third_party_report" | "employee_anecdote" | "analyst_view" | "agent_inference"

export type ResearchSource = {
  id: string
  url: string
  title: string
  publisher?: string | null
  sourceType: "official_company" | "regulatory_filing" | "government" | "court_record" | "news" | "industry_report" | "job_posting" | "employee_review" | "social_or_forum" | "other"
  publishedAt?: string | null
  accessedAt: string
  isPrimarySource: boolean
  credibility: ConfidenceLevel
}

export type ResearchFinding = {
  id: string
  category: string
  claim: string
  evidenceClassification: EvidenceClassification
  confidence: ConfidenceLevel
  evidenceSourceIds: string[]
  asOf?: string | null
  relevance?: string | null
  caveat?: string | null
}

export type ResearchSection = {
  id: string
  title: string
  summary: string
  bodyMarkdown: string
  findingIds: string[]
}

export type ResearchContradiction = {
  topic: string
  description: string
  competingFindingIds: string[]
  resolution?: string | null
}

export type ResearchGap = {
  topic: string
  description: string
  importance: ConfidenceLevel
  suggestedFollowUp?: string | null
}

export type AgentResearchReport = {
  schemaVersion: number
  agentId: ResearchAgentId
  companyName: string
  companyDomain?: string | null
  targetRole?: string | null
  generatedAt: string
  executiveSummary: string
  sections: ResearchSection[]
  findings: ResearchFinding[]
  contradictions: ResearchContradiction[]
  gaps: ResearchGap[]
  sources: ResearchSource[]
  overallConfidence: ConfidenceLevel
  reportMarkdown: string
}

export type AgentRun = {
  agentId: ResearchAgentId
  status: AgentRunStatus
  attemptCount: number
  startedAt?: string | null
  completedAt?: string | null
  stage?: string | null
  report?: AgentResearchReport | null
  error?: { code: string; message: string; retryable: boolean } | null
  metrics?: {
    durationMs?: number | null
    model?: string | null
    inputTokens?: number | null
    outputTokens?: number | null
    searchCount?: number | null
    estimatedCost?: number | null
  } | null
}

export type CompanyLedger = {
  schemaVersion: number
  generatedAt: string
  executiveCompanyBrief: string
  sections: ResearchSection[]
  importantContradictions: ResearchContradiction[]
  unansweredQuestions: ResearchGap[]
  sourceIndex: Array<{
    ledgerSourceId: string
    contributingAgentIds: ResearchAgentId[]
    source: ResearchSource
  }>
  agentReportIds: Partial<Record<ResearchAgentId, string>>
  missingAgentIds: ResearchAgentId[]
  ledgerMarkdown: string
}

export type CompanyResearchRun = {
  schemaVersion: number
  id: string
  jobId: number
  status: ResearchRunStatus
  input: CompanyResearchInput
  normalizedCompany?: {
    canonicalName: string
    domain?: string | null
    ticker?: string | null
    aliases: string[]
  } | null
  agents: Record<ResearchAgentId, AgentRun>
  ledger?: CompanyLedger | null
  ledgerStatus: AgentRunStatus
  ledgerError?: { code: string; message: string; retryable: boolean } | null
  agentStateVersion: number
  synthesizedAgentStateVersion?: number | null
  provider: string
  model: string
  effort: string
  createdAt: string
  startedAt?: string | null
  completedAt?: string | null
}

export type CompanyResearchInput = {
  companyName: string
  companyDomain?: string | null
  ticker?: string | null
  targetRole?: string | null
  targetLocation?: string | null
  jobDescription?: string | null
  jobPostingUrl?: string | null
}

export type StartCompanyResearchRequest = {
  runId: string
  jobId: number
  input: CompanyResearchInput
  provider: ResumeAiSelection["provider"]
  model: string
  effort: string
}

type CompanyResearchEvent =
  | { kind: "run_updated"; runId: string; agentId?: ResearchAgentId | null; run: CompanyResearchRun }
  | { kind: "activity"; runId: string; agentId: ResearchAgentId; event: ResumeAiStreamEvent }

export const listCompanyResearchRuns = (jobId: number) =>
  invoke<CompanyResearchRun[]>("list_company_research_runs", { jobId })

async function withResearchEvents<T>(
  runId: string,
  invokeResearch: () => Promise<T>,
  onEvent: (event: CompanyResearchEvent) => void,
) {
  const unlisten = await listen<CompanyResearchEvent>("company-research-event", (event) => {
    if (event.payload.runId === runId) onEvent(event.payload)
  })
  try {
    return await invokeResearch()
  } finally {
    unlisten()
  }
}

export const startCompanyResearchRun = (
  request: StartCompanyResearchRequest,
  onEvent: (event: CompanyResearchEvent) => void,
) => withResearchEvents(
  request.runId,
  () => invoke<CompanyResearchRun>("start_company_research_run", { request }),
  onEvent,
)

export const retryCompanyResearchAgent = (
  jobId: number,
  runId: string,
  agentId: ResearchAgentId,
  onEvent: (event: CompanyResearchEvent) => void,
) => withResearchEvents(
  runId,
  () => invoke<CompanyResearchRun>("retry_company_research_agent", {
    request: { jobId, runId, agentId },
  }),
  onEvent,
)

export const cancelCompanyResearchRun = (jobId: number, runId: string) =>
  invoke<CompanyResearchRun>("cancel_company_research_run", { jobId, runId })

export const retryCompanyResearchSynthesis = (jobId: number, runId: string) =>
  invoke<CompanyResearchRun>("retry_company_research_synthesis", { jobId, runId })

export function createCompanyResearchRunId() {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `company-research-${suffix}`
}
