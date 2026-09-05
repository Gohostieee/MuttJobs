import { invoke } from "@tauri-apps/api/core"
import type { ResumeAiSelection } from "./resume-ai"
export type Target = {
  id: string
  title: string
  interpretation: string
  category: string
  requirementClass: string
  priority: string
  grounding: string
  rationale: string
  sources: { paragraphId: string; quote: string; occurrence: number }[]
  evidenceExpectations: string[]
  criteria: {
    label: string
    relationship: string
    alternatives: string[]
    minimum: number | null
    unit: string | null
  }[]
}
export type Checklist = {
  revision: string
  analysis: {
    sourceRevision: string
    completeness: string
    warnings: string[]
    targets: Target[]
    ledger: {
      paragraphId: string
      targetIds: string[]
      classification: string
      reason: string
    }[]
  }
}
export type Evidence = {
  id: string
  profileRevision: string
  review: string
  reviewedAt: string | null
  suggestion: {
    targetId: string
    strength: string
    matchKind: string
    explanation: string
    references: { entryId: string; field: string; excerpt: string }[]
  }
}
export type Placement = {
  targetId: string
  field: string
  quote: string
  evidenceIds: string[]
}
export type Coverage = {
  id: string
  artifact: string
  placement: Placement
  status: string
  reviewedAt: string | null
}
export type PreparationAction = {
  id: string
  targetIds: string[]
  title: string
  destination: string
  prerequisites: string[]
  completionCondition: string
  status: string
  reason: string
}
export type Proposal = {
  id: string
  artifact: string
  data: unknown
  placements: Placement[]
  status: string
  createdAt: string
}
export type PreparationSummary = {
  jobId: number
  analysis: string
  highPriority: number
  evidenceToReview: number
  addressed: number
  total: number
  openActions: number
  deferred: number
  documentReview: string
  nextAction: string
  latestRun?: {
    id: string
    status: string
    message: string
    operation: string
  } | null
}
export type JobPreparation = {
  schemaVersion: number
  jobId: number
  revision: number
  source: {
    revision: string
    original: string
    text: string
    passages: { id: string; text: string }[]
  }
  checklist: Checklist | null
  candidate: Checklist | null
  history: Checklist[]
  overrides: {
    targetId: string
    target: Target
    dismissed: boolean
    note: string
    lineage: string[]
  }[]
  evidence: Evidence[]
  coverage: Coverage[]
  actions: PreparationAction[]
  proposals: Proposal[]
  activity: {
    id: string
    operation: string
    status: string
    message: string
    time: string
  }[]
  profileRevision: string
  artifactRevisions: Record<string, string>
  summary: PreparationSummary
}
export type WorkspaceOperation = "analyze" | "match" | "prepare" | "audit"
export type WorkspaceMutations = {
  source: { text: string }
  createDraft: { artifact: string }
  target: {
    target: Target
    note?: string
    lineage?: string[]
    dismissed?: boolean
  }
  splitTarget: { sourceId: string; targets: Target[]; note?: string }
  linkEvidence: Evidence["suggestion"]
  evidenceReview: { id: string; review: "Confirmed" | "Rejected" }
  action: PreparationAction
  acceptAnalysis: Record<string, never>
  rejectAnalysis: Record<string, never>
  placement: { artifact: string; placement: Placement }
  coverageReview: {
    id: string
    criteria: { criterionIndex: number; alternatives: number[] }[]
  }
  acceptProposal: { id: string }
  rejectProposal: { id: string }
}
export const readJobWorkspace = (jobId: number) =>
  invoke<JobPreparation>("job_workspace_read", { jobId })
export const listPreparationSummaries = () =>
  invoke<PreparationSummary[]>("job_workspace_summaries")
export const mutateJobWorkspace = <K extends keyof WorkspaceMutations>(
  workspace: JobPreparation,
  operation: K,
  payload: WorkspaceMutations[K],
) =>
  invoke<JobPreparation>("job_workspace_mutate", {
    request: {
      jobId: workspace.jobId,
      expectedRevision: workspace.revision,
      operation,
      payload,
    },
  })
export const cancelWorkspaceRun = (runId: string) =>
  invoke<void>("job_workspace_cancel", { runId })
export function runWorkspace(
  workspace: JobPreparation,
  operation: WorkspaceOperation,
  selection: ResumeAiSelection,
  runId: string,
  targetIds: string[] = [],
  artifact = "resume",
  includeResearch = false,
) {
  return invoke<JobPreparation>("job_workspace_run", {
    request: {
      jobId: workspace.jobId,
      expectedRevision: workspace.revision,
      runId,
      operation,
      ...selection,
      targetIds,
      artifact,
      includeResearch,
    },
  })
}
export function workspaceTargets(workspace: JobPreparation): Target[] {
  const targets = new Map(
    workspace.checklist?.analysis.targets.map((t) => [t.id, t]) ?? [],
  )
  for (const o of workspace.overrides) {
    targets.delete(o.targetId)
    if (
      !o.dismissed &&
      (o.target.grounding === "Manual" ||
        o.lineage.length > 0 ||
        workspace.checklist?.analysis.targets.some((t) => t.id === o.targetId))
    )
      targets.set(o.targetId, o.target)
  }
  return [...targets.values()].sort(
    (a, b) =>
      ["Must hit", "High", "Medium", "Bonus"].indexOf(a.priority) -
      ["Must hit", "High", "Medium", "Bonus"].indexOf(b.priority),
  )
}
export function workspaceError(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  if (typeof reason === "object" && reason && "message" in reason)
    return String(reason.message)
  return String(reason || "Operation failed. Previous work retained.")
}
export function emptyTarget(): Target {
  return {
    id: "",
    title: "",
    interpretation: "",
    category: "Personal preparation",
    requirementClass: "Contextual signal",
    priority: "Medium",
    grounding: "Manual",
    rationale: "User supplied preparation target",
    sources: [],
    evidenceExpectations: [],
    criteria: [],
  }
}
