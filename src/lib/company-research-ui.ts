export type CompanyResearchAgentUiStatus =
  | "queued"
  | "running"
  | "validating"
  | "completed"
  | "failed"
  | "timed_out"
  | "cancelled"

export function companyResearchAgentPanelMode(
  status: CompanyResearchAgentUiStatus,
  hasReport: boolean,
): "active" | "report" | "error" | "empty" {
  if (status === "running" || status === "validating") return "active"
  if (hasReport) return "report"
  if (status === "failed" || status === "timed_out") return "error"
  return "empty"
}

export function canRetryCompanyResearchAgent(status: CompanyResearchAgentUiStatus) {
  return status === "failed" || status === "timed_out" || status === "cancelled"
}

export function companyResearchRunCounts(statuses: CompanyResearchAgentUiStatus[]) {
  return {
    completed: statuses.filter((status) => status === "completed").length,
    terminal: statuses.filter((status) =>
      status === "completed" || status === "failed" || status === "timed_out" || status === "cancelled"
    ).length,
  }
}
