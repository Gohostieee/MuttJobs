import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import {
  AlertTriangle,
  Building2,
  Check,
  CircleAlert,
  CircleDashed,
  ExternalLink,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Square,
  UsersRound,
} from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"

import { MessageResponse } from "@/components/ai-elements/message"
import {
  AgentActivityTrace,
  DEFAULT_RESUME_AI_SELECTION,
  ModelReasoningSelector,
  type AgentActivity,
} from "@/components/resume-ai-sidebar"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  cancelCompanyResearchRun,
  createCompanyResearchRunId,
  listCompanyResearchRuns,
  retryCompanyResearchAgent,
  retryCompanyResearchSynthesis,
  startCompanyResearchRun,
  type AgentResearchReport,
  type AgentRunStatus,
  type CompanyLedger,
  type CompanyResearchRun,
  type ResearchAgentId,
} from "@/lib/company-research"
import type { ResumeAiSelection, ResumeAiStreamEvent } from "@/lib/resume-ai"
import {
  canRetryCompanyResearchAgent,
  companyResearchAgentPanelMode,
  companyResearchRunCounts,
} from "@/lib/company-research-ui"
import type { TheirStackJob } from "@/lib/theirstack"
import { cn } from "@/lib/utils"

type ResearchAgentDefinition = {
  id: ResearchAgentId
  label: string
  shortLabel: string
  description: string
  icon: typeof Building2
}

type LiveAgentState = {
  activities: AgentActivity[]
  usage?: Record<string, unknown>
  stage?: string
}

const RESEARCH_AGENTS: ResearchAgentDefinition[] = [
  { id: "company_identity", label: "Company Identity and Business Model", shortLabel: "Identity", description: "Canonical identity, leadership, products, customers, ownership, and revenue model.", icon: Building2 },
  { id: "company_culture", label: "Company Culture and Employee Experience", shortLabel: "Culture", description: "Official values compared with reported day-to-day employee experience.", icon: UsersRound },
  { id: "future_prospects", label: "Future Prospects and Strategic Outlook", shortLabel: "Outlook", description: "Strategic bets, financial signals, industry forces, scenarios, and material risks.", icon: Sparkles },
  { id: "public_reputation", label: "Public Reputation, News, and Controversies", shortLabel: "Reputation", description: "Current news, public successes, criticism, legal matters, and unresolved risks.", icon: ShieldAlert },
  { id: "hiring_intelligence", label: "Hiring and Role Intelligence", shortLabel: "Hiring", description: "Current hiring signals and concrete application and interview intelligence.", icon: FileSearch },
]

const emptyLiveState = (): Record<ResearchAgentId, LiveAgentState> => ({
  company_identity: { activities: [] },
  company_culture: { activities: [] },
  future_prospects: { activities: [] },
  public_reputation: { activities: [] },
  hiring_intelligence: { activities: [] },
})

export function CompanyResearchWorkspace({ job }: { job: TheirStackJob }) {
  const [selection, setSelection] = useState<ResumeAiSelection>(DEFAULT_RESUME_AI_SELECTION)
  const [runs, setRuns] = useState<CompanyResearchRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string>()
  const [activeAgent, setActiveAgent] = useState<ResearchAgentId>(RESEARCH_AGENTS[0].id)
  const [live, setLive] = useState<Record<ResearchAgentId, LiveAgentState>>(emptyLiveState)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    let active = true
    setLoadError("")
    void listCompanyResearchRuns(job.id)
      .then((nextRuns) => {
        if (!active) return
        setRuns(nextRuns)
        setSelectedRunId(nextRuns[0]?.id)
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(errorMessage(reason, "Saved company research could not be loaded."))
      })
    return () => { active = false }
  }, [job.id])

  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0]
  const isRunning = selectedRun?.status === "running"
  const completedReportCount = selectedRun
    ? Object.values(selectedRun.agents).filter((agent) => Boolean(agent.report)).length
    : 0

  function upsertRun(run: CompanyResearchRun) {
    setRuns((current) => [run, ...current.filter((candidate) => candidate.id !== run.id)])
    setSelectedRunId(run.id)
  }

  function applyStreamEvent(agentId: ResearchAgentId, event: ResumeAiStreamEvent) {
    setLive((current) => {
      const state = current[agentId]
      if (event.type === "item") {
        const activity: AgentActivity = { id: event.id, kind: event.kind, status: event.status, eventType: event.eventType, item: event.item }
        const existing = state.activities.findIndex((candidate) => candidate.id === activity.id)
        const activities = existing === -1
          ? [...state.activities, activity]
          : state.activities.map((candidate, index) => index === existing ? activity : candidate)
        return { ...current, [agentId]: { ...state, activities } }
      }
      if (event.type === "usage") return { ...current, [agentId]: { ...state, usage: event.usage } }
      if (event.type === "progress") return { ...current, [agentId]: { ...state, stage: event.stage } }
      return current
    })
  }

  function handleResearchEvent(event: Parameters<Parameters<typeof startCompanyResearchRun>[1]>[0]) {
    if (event.kind === "run_updated") upsertRun(event.run)
    else applyStreamEvent(event.agentId, event.event)
  }

  async function runResearch() {
    if (!job.company?.trim()) return
    if (isRunning && selectedRun) {
      try {
        upsertRun(await cancelCompanyResearchRun(job.id, selectedRun.id))
      } catch (reason) {
        setLoadError(errorMessage(reason, "Company research could not be cancelled."))
      }
      return
    }
    const runId = createCompanyResearchRunId()
    setLoadError("")
    setLive(emptyLiveState())
    setActiveAgent(RESEARCH_AGENTS[0].id)
    setSelectedRunId(runId)
    try {
      const run = await startCompanyResearchRun({
        runId,
        jobId: job.id,
        input: {
          companyName: job.company,
          targetRole: job.jobTitle,
          targetLocation: job.location ?? job.longLocation ?? job.shortLocation,
          jobDescription: job.description,
          jobPostingUrl: job.finalUrl ?? job.url ?? job.sourceUrl,
        },
        provider: selection.provider,
        model: selection.model,
        effort: selection.effort,
      }, handleResearchEvent)
      upsertRun(run)
    } catch (reason) {
      setLoadError(errorMessage(reason, "Company research could not be started."))
      void listCompanyResearchRuns(job.id).then(setRuns).catch(() => undefined)
    }
  }

  async function retryAgent(agentId: ResearchAgentId) {
    if (!selectedRun) return
    setLoadError("")
    setLive((current) => ({ ...current, [agentId]: { activities: [] } }))
    try {
      upsertRun(await retryCompanyResearchAgent(job.id, selectedRun.id, agentId, handleResearchEvent))
    } catch (reason) {
      setLoadError(errorMessage(reason, "That research agent could not be retried."))
    }
  }

  async function retrySynthesis() {
    if (!selectedRun) return
    setLoadError("")
    try {
      upsertRun(await retryCompanyResearchSynthesis(job.id, selectedRun.id))
    } catch (reason) {
      setLoadError(errorMessage(reason, "The Company Ledger could not be rebuilt."))
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="gap-4 border-b lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base"><Search className="size-4 text-muted-foreground" /> Company research</CardTitle>
            <CardDescription>Five independent specialists research in parallel and assemble a sourced Company Ledger.</CardDescription>
          </div>
          <div className="company-research-controls flex flex-wrap items-center gap-2 rounded-lg border bg-background p-1.5">
            <ModelReasoningSelector disabled={isRunning} value={selection} onChange={setSelection} />
            <Button type="button" size="sm" variant={isRunning ? "destructive" : "default"} onClick={() => void runResearch()} disabled={!job.company?.trim()}>
              {isRunning ? <Square /> : <Search />}
              {isRunning ? "Cancel research" : "Research company"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {runs.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Runs</span>
              {runs.map((run) => (
                <Button key={run.id} type="button" size="sm" variant={run.id === selectedRun?.id ? "secondary" : "outline"} onClick={() => setSelectedRunId(run.id)} disabled={isRunning && run.id !== selectedRun?.id}>
                  {formatResearchDate(run.createdAt, "MMM d, h:mm a")}
                  <RunStatusDot status={run.status} />
                </Button>
              ))}
            </div>
          ) : null}

          {selectedRun ? <RunSummary run={selectedRun} /> : null}
          {selectedRun?.ledger ? <LedgerView ledger={selectedRun.ledger} /> : null}
          {selectedRun?.ledgerError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              <p className="flex min-w-0 items-start gap-2">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                {completedReportCount > 0
                  ? `Company Ledger synthesis failed; ${completedReportCount} completed specialist report${completedReportCount === 1 ? " remains" : "s remain"} available: `
                  : "Company Ledger could not be assembled because no validated specialist reports were produced: "}
                {selectedRun.ledgerError.message}
              </p>
              {completedReportCount > 0 ? <Button type="button" size="sm" variant="outline" onClick={() => void retrySynthesis()}><RefreshCw /> Retry synthesis</Button> : null}
            </div>
          ) : null}

          <Tabs value={activeAgent} onValueChange={(value) => setActiveAgent(value as ResearchAgentId)}>
            <TabsList className="h-auto w-full justify-start overflow-x-auto border-b" variant="line" aria-label="Company research specialists">
              {RESEARCH_AGENTS.map((agent) => {
                const status = selectedRun?.agents[agent.id]?.status ?? "queued"
                return (
                  <TabsTrigger className="min-h-10 flex-none px-3" value={agent.id} key={agent.id}>
                    <AgentStatusIcon status={status} /> {agent.shortLabel}
                  </TabsTrigger>
                )
              })}
            </TabsList>
            {RESEARCH_AGENTS.map((agent) => {
              const agentRun = selectedRun?.agents[agent.id]
              return (
                <TabsContent value={agent.id} className="mt-5" key={agent.id}>
                  <AgentPanel
                    definition={agent}
                    agentRun={agentRun}
                    liveState={live[agent.id]}
                    onRetry={() => void retryAgent(agent.id)}
                  />
                </TabsContent>
              )
            })}
          </Tabs>
          {!selectedRun ? <EmptyResearchState /> : null}
          {loadError ? <p className="text-sm text-destructive" role="alert">{loadError}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}

function RunSummary({ run }: { run: CompanyResearchRun }) {
  const { completed, terminal } = companyResearchRunCounts(Object.values(run.agents).map((agent) => agent.status))
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/10 px-4 py-3">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>{statusLabel(run.status)}</Badge>
          <span className="text-xs text-muted-foreground">{completed} of 5 reports complete · {terminal} agents settled</span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Started {formatResearchDate(run.createdAt, "MMM d, yyyy 'at' h:mm a")} · {run.provider} · {run.model || "provider default"}</p>
      </div>
      {run.ledgerStatus === "running" ? <span className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" /> Assembling Company Ledger</span> : null}
    </div>
  )
}

function AgentPanel({ definition, agentRun, liveState, onRetry }: { definition: ResearchAgentDefinition; agentRun?: CompanyResearchRun["agents"][ResearchAgentId]; liveState: LiveAgentState; onRetry: () => void }) {
  const status = agentRun?.status ?? "queued"
  const Icon = definition.icon
  const panelMode = companyResearchAgentPanelMode(status, Boolean(agentRun?.report))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold"><Icon className="size-4 text-muted-foreground" /> {definition.label}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{definition.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <AgentStatusBadge status={status} />
          {agentRun && canRetryCompanyResearchAgent(status) ? (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}><RefreshCw /> Retry this agent</Button>
          ) : null}
        </div>
      </div>

      {panelMode === "active" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-h-[20rem] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/10 px-6 text-center">
            <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm font-medium capitalize">{liveState.stage ?? agentRun?.stage ?? "researching"}</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">This report will become readable here as soon as this specialist finishes; the other four continue independently.</p>
          </div>
          <ActivityPanel liveState={liveState} status={status} />
        </div>
      ) : panelMode === "report" && agentRun?.report ? (
        <ResearchReportView report={agentRun.report} metrics={agentRun.metrics} />
      ) : (
        <div className="flex min-h-[20rem] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/10 px-6 text-center">
          {status === "failed" || status === "timed_out" ? <CircleAlert className="size-6 text-destructive" /> : <CircleDashed className="size-6 text-muted-foreground" />}
          <h4 className="mt-4 text-sm font-medium">{status === "failed" || status === "timed_out" ? "This specialist did not complete" : "Waiting for a research run"}</h4>
          <p className="mt-1.5 max-w-lg text-sm leading-6 text-muted-foreground">{agentRun?.error?.message ?? definition.description}</p>
        </div>
      )}
    </div>
  )
}

function ResearchReportView({ report, metrics }: { report: AgentResearchReport; metrics?: CompanyResearchRun["agents"][ResearchAgentId]["metrics"] }) {
  const sourceById = useMemo(() => new Map(report.sources.map((source) => [source.id, source])), [report.sources])
  const findingById = useMemo(() => new Map(report.findings.map((finding) => [finding.id, finding])), [report.findings])
  return (
    <article className="min-w-0 overflow-hidden rounded-xl border bg-background">
      <header className="space-y-3 border-b px-5 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Saved locally</Badge>
          <ConfidenceBadge confidence={report.overallConfidence} />
          <span className="text-xs text-muted-foreground">Completed {formatResearchDate(report.generatedAt, "MMM d, yyyy 'at' h:mm a")}</span>
          {metrics?.durationMs ? <span className="text-xs text-muted-foreground">· {formatDuration(metrics.durationMs)}</span> : null}
          {metrics?.searchCount ? <span className="text-xs text-muted-foreground">· {metrics.searchCount} searches</span> : null}
        </div>
        <p className="text-[0.96rem] leading-7 text-foreground/90">{report.executiveSummary}</p>
      </header>
      <div className="space-y-7 px-5 py-5">
        {report.sections.map((section) => {
          const findings = section.findingIds.map((id) => findingById.get(id)).filter(Boolean)
          return (
            <section key={section.id} className="space-y-3">
              <h4 className="text-sm font-semibold">{section.title}</h4>
              <MessageResponse className="company-research-markdown text-sm leading-6">{section.bodyMarkdown}</MessageResponse>
              {findings.length ? (
                <div className="space-y-2 rounded-lg border bg-muted/10 p-3">
                  {findings.map((finding) => finding ? (
                    <div key={finding.id} className="text-xs leading-5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[0.67rem]">{classificationLabel(finding.evidenceClassification)}</Badge>
                        <ConfidenceBadge confidence={finding.confidence} />
                        {finding.asOf ? <span className="text-muted-foreground">as of {finding.asOf}</span> : null}
                      </div>
                      <p className="mt-1.5 text-foreground/85">{finding.claim}</p>
                      {finding.evidenceSourceIds.length ? <p className="mt-1 text-muted-foreground">Sources: {finding.evidenceSourceIds.map((id) => sourceById.get(id)?.title ?? id).join(" · ")}</p> : null}
                    </div>
                  ) : null)}
                </div>
              ) : null}
              <Separator />
            </section>
          )
        })}
        <ReportEvidence report={report} />
      </div>
    </article>
  )
}

function ReportEvidence({ report }: { report: AgentResearchReport }) {
  return (
    <Accordion type="multiple" defaultValue={["sources"]}>
      <AccordionItem value="contradictions">
        <AccordionTrigger>Contradictions ({report.contradictions.length})</AccordionTrigger>
        <AccordionContent className="space-y-3">
          {report.contradictions.length ? report.contradictions.map((item) => (
            <div key={`${item.topic}-${item.description}`} className="rounded-lg border p-3 text-sm leading-6">
              <p className="font-medium">{item.topic}</p><p className="mt-1 text-muted-foreground">{item.description}</p>
              {item.resolution ? <p className="mt-1">Current resolution: {item.resolution}</p> : null}
            </div>
          )) : <p className="text-muted-foreground">No material contradictions were reported.</p>}
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="gaps">
        <AccordionTrigger>Unknowns and research gaps ({report.gaps.length})</AccordionTrigger>
        <AccordionContent className="space-y-3">
          {report.gaps.length ? report.gaps.map((gap) => (
            <div key={`${gap.topic}-${gap.description}`} className="rounded-lg border p-3 text-sm leading-6"><p className="font-medium">{gap.topic}</p><p className="mt-1 text-muted-foreground">{gap.description}</p>{gap.suggestedFollowUp ? <p className="mt-1">Follow up: {gap.suggestedFollowUp}</p> : null}</div>
          )) : <p className="text-muted-foreground">No material gaps were reported.</p>}
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="sources">
        <AccordionTrigger>Sources ({report.sources.length})</AccordionTrigger>
        <AccordionContent className="space-y-2">
          {report.sources.map((source) => <SourceButton key={source.id} source={source} />)}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function LedgerView({ ledger }: { ledger: CompanyLedger }) {
  return (
    <Card className="border-primary/20 bg-primary/[0.025]">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4" /> Company Ledger</CardTitle><CardDescription>Assembled only from the validated specialist reports and their cited sources.</CardDescription></div>
          <Badge variant={ledger.missingAgentIds.length ? "outline" : "secondary"}>{ledger.missingAgentIds.length ? `Completed with ${ledger.missingAgentIds.length} gap${ledger.missingAgentIds.length === 1 ? "" : "s"}` : "All five reports complete"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <MessageResponse className="company-research-markdown text-sm leading-6">{ledger.executiveCompanyBrief}</MessageResponse>
        <Accordion type="multiple">
          {ledger.sections.map((section) => (
            <AccordionItem value={section.id} key={section.id}><AccordionTrigger>{section.title}</AccordionTrigger><AccordionContent><MessageResponse className="company-research-markdown text-sm leading-6">{section.bodyMarkdown}</MessageResponse></AccordionContent></AccordionItem>
          ))}
          <AccordionItem value="ledger-sources"><AccordionTrigger>Unified source index ({ledger.sourceIndex.length})</AccordionTrigger><AccordionContent className="space-y-2">{ledger.sourceIndex.map((entry) => <SourceButton key={entry.ledgerSourceId} source={entry.source} agentIds={entry.contributingAgentIds} />)}</AccordionContent></AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}

function SourceButton({ source, agentIds }: { source: AgentResearchReport["sources"][number]; agentIds?: ResearchAgentId[] }) {
  return (
    <button type="button" className="flex w-full items-start justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors hover:bg-muted/50" onClick={() => void openUrl(source.url)}>
      <span className="min-w-0"><span className="block truncate text-sm font-medium">{source.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{source.publisher ?? source.sourceType.replaceAll("_", " ")} · accessed {formatResearchDate(source.accessedAt, "MMM d, yyyy")}{source.isPrimarySource ? " · primary source" : ""}{agentIds ? ` · used by ${agentIds.length} specialist${agentIds.length === 1 ? "" : "s"}` : ""}</span></span>
      <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function ActivityPanel({ liveState, status }: { liveState: LiveAgentState; status: AgentRunStatus }) {
  return (
    <aside className="min-w-0 rounded-xl border bg-muted/10 p-4">
      <p className="text-sm font-semibold">Live research activity</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Searches and tool activity from this specialist.</p>
      <Separator className="my-4" />
      {liveState.activities.length ? <AgentActivityTrace activities={liveState.activities} isStreaming={status === "running"} /> : <div className="rounded-lg border border-dashed px-3 py-8 text-center text-xs leading-5 text-muted-foreground">Waiting for the first research event.</div>}
    </aside>
  )
}

function EmptyResearchState() {
  return <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/10 px-6 text-center"><Building2 className="size-6 text-muted-foreground" /><h3 className="mt-4 text-base font-medium">No Company Ledger yet</h3><p className="mt-1.5 max-w-lg text-sm leading-6 text-muted-foreground">One research action launches all five specialists concurrently. Their tabs fill independently as each validated report is saved.</p></div>
}

function AgentStatusIcon({ status }: { status: AgentRunStatus }) {
  if (status === "running" || status === "validating") return <LoaderCircle className="animate-spin" />
  if (status === "completed") return <Check />
  if (status === "failed" || status === "timed_out") return <CircleAlert />
  if (status === "cancelled") return <Square />
  return <CircleDashed />
}

function AgentStatusBadge({ status }: { status: AgentRunStatus }) {
  return <Badge variant={status === "failed" || status === "timed_out" ? "destructive" : status === "completed" ? "secondary" : "outline"} className={cn("shrink-0", (status === "running" || status === "validating") && "animate-pulse")}>{statusLabel(status)}</Badge>
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  return <Badge variant="outline" className={cn("text-[0.67rem]", confidence === "low" && "border-amber-500/40 text-amber-600 dark:text-amber-400")}>{confidence} confidence</Badge>
}

function RunStatusDot({ status }: { status: CompanyResearchRun["status"] }) {
  if (status === "running") return <LoaderCircle className="size-3 animate-spin" />
  if (status === "completed") return <Check className="size-3" />
  if (status === "completed_with_gaps") return <AlertTriangle className="size-3" />
  if (status === "failed") return <CircleAlert className="size-3" />
  return <CircleDashed className="size-3" />
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase())
}

function classificationLabel(value: string) {
  return value.replaceAll("_", " ")
}

function formatDuration(durationMs: number) {
  if (durationMs < 60_000) return `${Math.max(1, Math.round(durationMs / 1_000))}s`
  return `${Math.round(durationMs / 60_000)}m`
}

function formatResearchDate(value: string, pattern: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "date unavailable" : format(date, pattern)
}

function errorMessage(reason: unknown, fallback: string) {
  if (typeof reason === "string" && reason.trim()) return reason
  if (reason instanceof Error && reason.message.trim()) return reason.message
  return fallback
}
