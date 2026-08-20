import { useRef, useState, type ReactNode } from "react"
import { format } from "date-fns"
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Bot,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  FilePenLine,
  FileText,
  Globe2,
  Laptop,
  Mail,
  MapPin,
  Sparkles,
  type LucideIcon,
  UserRound,
} from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CompanyResearchWorkspace } from "@/components/company-research-workspace"
import { ResumeMatchingWorkspace } from "@/components/resume-matching-workspace"
import { ResumeCreationWorkspace } from "@/components/resume-creation-workspace"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  applicationStatusMetadata,
  defaultApplicationStatus,
  type TheirStackJob,
} from "@/lib/theirstack"
import { cn } from "@/lib/utils"

type JobWorkspaceProps = {
  job: TheirStackJob
  onBack: () => void
  onJobChange?: (job: TheirStackJob) => void
  onDocumentViewerChange?: (open: boolean) => void
}

type JobFlowStepId =
  | "description"
  | "company-data"
  | "resume-matching"
  | "resume-creation"
  | "cover-letter"

type JobFlowStep = {
  id: JobFlowStepId
  number: number
  label: string
  description: string
  icon: LucideIcon
}

const JOB_FLOW_STEPS: JobFlowStep[] = [
  {
    id: "description",
    number: 0,
    label: "Description",
    description: "Review the role and pull out the signals that matter.",
    icon: FileText,
  },
  {
    id: "company-data",
    number: 1,
    label: "Company data collection",
    description: "Capture the company context for the rest of the application.",
    icon: Building2,
  },
  {
    id: "resume-matching",
    number: 2,
    label: "Resume matching",
    description: "Compare the opportunity with your strongest resume signals.",
    icon: Sparkles,
  },
  {
    id: "resume-creation",
    number: 3,
    label: "Resume creation",
    description: "Shape a focused resume around the role and the match findings.",
    icon: FilePenLine,
  },
  {
    id: "cover-letter",
    number: 4,
    label: "Cover letter creation",
    description: "Turn the job and resume context into a focused letter.",
    icon: Mail,
  },
]

const WORKFLOW_SCAFFOLD_SECTIONS: Record<Exclude<JobFlowStepId, "description">, string[]> = {
  "company-data": ["Company profile", "Team and leadership", "Signals and context"],
  "resume-matching": ["Match summary", "Strongest evidence", "Potential gaps"],
  "resume-creation": ["Resume direction", "Tailored sections", "Final polish"],
  "cover-letter": ["Letter outline", "Draft workspace", "Final review"],
}

export function JobWorkspace({
  job,
  onBack,
  onJobChange,
  onDocumentViewerChange,
}: JobWorkspaceProps) {
  const [copied, setCopied] = useState(false)
  const [activeStepId, setActiveStepId] = useState<JobFlowStepId>("description")
  const contentRef = useRef<HTMLDivElement>(null)
  const jobUrl = job.finalUrl || job.url || job.sourceUrl
  const location = jobLocation(job)
  const status = applicationStatusMetadata.find(
    (candidate) => candidate.value === (job.applicationStatus ?? defaultApplicationStatus),
  )
  const technologies = job.technologySlugs.map(titleFromSlug)
  const technologySet = new Set(job.technologySlugs)
  const keywords = job.keywordSlugs
    .filter((slug) => !technologySet.has(slug))
    .map(titleFromSlug)
  const activeStepIndex = JOB_FLOW_STEPS.findIndex((step) => step.id === activeStepId)
  const activeStep = JOB_FLOW_STEPS[activeStepIndex] ?? JOB_FLOW_STEPS[0]
  const isLastStep = activeStepIndex === JOB_FLOW_STEPS.length - 1

  function selectStep(stepId: JobFlowStepId) {
    setActiveStepId(stepId)
    requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0, behavior: "smooth" }))
  }

  function continueToNextStep() {
    const nextStep = JOB_FLOW_STEPS[activeStepIndex + 1]
    if (nextStep) selectStep(nextStep.id)
  }

  async function copyDescription() {
    if (!job.description || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(job.description)
    setCopied(true)
  }

  return (
    <main className="flex min-h-svh flex-1 flex-col overflow-hidden bg-muted/20">
      <header className="shrink-0 border-b bg-background px-5 py-4 md:px-8">
        <div className="mx-auto max-w-[1500px]">
          <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={onBack}>
            <ArrowLeft />
            Applications
          </Button>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <CompanyLogo job={job} />
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-normal">
                    <BriefcaseBusiness data-icon="inline-start" /> Job workspace
                  </Badge>
                  <Badge variant="outline">{status?.label ?? "Saved"}</Badge>
                </div>
                <h1 className="text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
                  {job.jobTitle}
                </h1>
                <p className="mt-1.5 flex items-center gap-2 text-base text-muted-foreground">
                  <Building2 className="size-4 shrink-0" />
                  <span className="truncate">{job.company || "Company not provided"}</span>
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {job.description ? (
                <Button variant="outline" onClick={() => void copyDescription()}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy description"}
                </Button>
              ) : null}
              {jobUrl ? (
                <Button onClick={() => void openUrl(jobUrl)}>
                  Open original
                  <ExternalLink />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <JobMeta icon={<CalendarDays />} label={formatPostedLabel(job.datePosted)} />
            <JobMeta icon={<MapPin />} label={location} />
            <JobMeta icon={<BadgeDollarSign />} label={jobSalary(job)} />
            {job.employmentStatuses.length ? (
              <JobMeta
                icon={<BriefcaseBusiness />}
                label={job.employmentStatuses.map(titleFromSlug).join(", ")}
              />
            ) : null}
            {job.seniority ? (
              <JobMeta icon={<UserRound />} label={titleFromSlug(job.seniority)} />
            ) : null}
            {job.remote || job.hybrid ? (
              <JobMeta icon={<Laptop />} label={job.remote ? "Remote" : "Hybrid"} />
            ) : null}
            {job.easyApply != null ? (
              <JobMeta
                icon={<Sparkles />}
                label={job.easyApply ? "Easy apply" : "External apply"}
              />
            ) : null}
            {jobUrl ? <JobMeta icon={<Globe2 />} label={sourceDomain(jobUrl)} /> : null}
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b bg-background">
        <div className="mx-auto max-w-[1500px] overflow-x-auto px-5 py-4 md:px-8">
          <nav
            aria-label="Job application steps"
            className="flex min-w-[50rem] items-center"
          >
            {JOB_FLOW_STEPS.map((step, index) => {
              const StepIcon = step.icon
              const isActive = step.id === activeStepId
              const isComplete = index < activeStepIndex

              return (
                <div key={step.id} className="flex min-w-0 flex-1 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    aria-current={isActive ? "step" : undefined}
                    aria-label={`Go to step ${step.number}: ${step.label}`}
                    className={cn(
                      "h-auto min-w-0 flex-1 justify-start gap-2 rounded-lg px-2.5 py-2 text-left sm:px-3",
                      isActive && "bg-muted hover:bg-muted",
                    )}
                    onClick={() => selectStep(step.id)}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        isActive && "border-primary bg-primary text-primary-foreground",
                        isComplete && "border-primary/50 bg-primary/10 text-primary",
                        !isActive && !isComplete && "border-border bg-background text-muted-foreground",
                      )}
                    >
                      {isComplete ? <Check className="size-4" /> : <StepIcon className="size-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.65rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Step {step.number}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block truncate text-sm font-medium",
                          isActive ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {step.label}
                      </span>
                    </span>
                  </Button>
                  {index < JOB_FLOW_STEPS.length - 1 ? (
                    <div
                      aria-hidden="true"
                      className={cn(
                        "mx-1 h-px w-5 shrink-0 bg-border sm:mx-2 sm:w-8",
                        index < activeStepIndex && "bg-primary/40",
                      )}
                    />
                  ) : null}
                </div>
              )
            })}
          </nav>
        </div>
      </div>

      <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-5 py-5 md:px-8 md:py-7">
          <aside className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="size-4 text-muted-foreground" />
                    Application workflow
                  </CardTitle>
                  <Badge variant="secondary" className="font-normal">UI scaffold</Badge>
                </div>
                <CardDescription>
                  A guided path from the role description to your application materials.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {activeStep.number} / {JOB_FLOW_STEPS.length - 1}
                  </span>
                </div>
                <Progress
                  value={(activeStepIndex / (JOB_FLOW_STEPS.length - 1)) * 100}
                  className="h-1.5"
                />
                <div className="rounded-lg border bg-muted/20 px-3.5 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    Current step
                  </p>
                  <p className="mt-1.5 text-sm font-medium">{activeStep.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {activeStep.description}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Job details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <DetailRow label="Pipeline stage" value={status?.label ?? "Saved"} />
                <Separator />
                <DetailRow label="Posted" value={formatJobDate(job.datePosted)} />
                <Separator />
                <DetailRow label="Discovered" value={formatJobDate(job.discoveredAt)} />
                <Separator />
                <DetailRow label="Location" value={location} />
                {job.hiringTeam.length ? (
                  <>
                    <Separator />
                    <DetailRow
                      label="Hiring team"
                      value={job.hiringTeam
                        .map((member) => member.fullName || member.role)
                        .filter(Boolean)
                        .join(", ")}
                    />
                  </>
                ) : null}
                {job.managerRoles.length ? (
                  <>
                    <Separator />
                    <DetailRow label="Reports to" value={job.managerRoles.join(", ")} />
                  </>
                ) : null}
              </CardContent>
            </Card>
          </aside>

          <div className="min-w-0 space-y-5">
            <section aria-labelledby="active-step-title" className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Step {activeStep.number} of {JOB_FLOW_STEPS.length - 1}
              </p>
              <h2 id="active-step-title" className="text-2xl font-semibold tracking-tight">
                {activeStep.label}
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {activeStep.description}
              </p>
            </section>

            {activeStep.id === "description" ? (
              <>
                <Card>
                  <CardHeader className="border-b">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="size-4 text-muted-foreground" />
                      Job description
                    </CardTitle>
                    <CardDescription>
                      Start by getting familiar with the role and what the team is looking for.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {job.description ? (
                      <div className="whitespace-pre-wrap text-[0.96rem] leading-7 text-foreground/90">
                        {job.description}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No job description was provided for this role.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="border-b">
                    <CardTitle className="text-base">Role signals</CardTitle>
                    <CardDescription>
                      A quick reference for the signals already identified in this role.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-6 pt-6 md:grid-cols-2">
                    <TagGroup title="Technologies" values={technologies} />
                    <TagGroup title="Keywords" values={keywords} />
                  </CardContent>
                </Card>
              </>
            ) : activeStep.id === "company-data" ? (
              <CompanyResearchWorkspace job={job} />
            ) : activeStep.id === "resume-matching" ? (
              <ResumeMatchingWorkspace job={job} onJobChange={onJobChange} />
            ) : activeStep.id === "resume-creation" ? (
              <ResumeCreationWorkspace
                job={job}
                onEditorChange={onDocumentViewerChange}
                onBackToJob={() => selectStep("description")}
              />
            ) : (
              <WorkflowScaffoldCard step={activeStep} />
            )}

            <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Keep moving through the workspace</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  You can jump to any step above whenever you’re ready.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {activeStepIndex > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => selectStep(JOB_FLOW_STEPS[activeStepIndex - 1].id)}
                  >
                    <ArrowLeft />
                    Back
                  </Button>
                ) : null}
                <Button type="button" onClick={continueToNextStep} disabled={isLastStep}>
                  {isLastStep ? "All steps ready" : "Continue"}
                  {!isLastStep ? <ArrowRight /> : null}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function WorkflowScaffoldCard({ step }: { step: JobFlowStep }) {
  const StepIcon = step.icon
  const scaffoldSections =
    step.id === "description" ? [] : WORKFLOW_SCAFFOLD_SECTIONS[step.id]

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <StepIcon className="size-4 text-muted-foreground" />
          {step.label}
        </CardTitle>
        <CardDescription>
          This stage is laid out and ready for its product workflow to be added.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl border bg-background">
            <StepIcon className="size-5 text-muted-foreground" />
          </div>
          <Badge variant="secondary" className="mt-4 font-normal">
            Scaffolded step
          </Badge>
          <h3 className="mt-3 text-base font-medium">{step.label} will live here</h3>
          <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">
            The structure is ready for the controls, data, and guidance that will make this step
            useful.
          </p>
          <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
            {scaffoldSections.map((section) => (
              <div key={section} className="rounded-lg border bg-background px-3.5 py-3 text-left">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-muted-foreground/40" />
                  <p className="text-sm font-medium">{section}</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Coming in a later pass</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CompanyLogo({ job }: { job: TheirStackJob }) {
  return (
    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted text-lg font-semibold text-muted-foreground">
      {job.companyObject?.logo ? (
        <img src={job.companyObject.logo} alt="" className="size-full object-contain p-2" />
      ) : (
        (job.company || job.jobTitle).trim().charAt(0).toUpperCase()
      )}
    </div>
  )
}

function JobMeta({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-lg bg-muted px-2.5 text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
      {icon}
      <span className="truncate">{label}</span>
    </span>
  )
}

function TagGroup({ title, values }: { title: string; values: string[] }) {
  return (
    <section>
      <h2 className="text-sm font-medium">{title}</h2>
      {values.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {values.map((value) => (
            <Badge key={value} variant="secondary" className="font-normal">
              {value}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">None identified</p>
      )}
    </section>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value}</span>
    </div>
  )
}

function jobLocation(job: TheirStackJob) {
  return (
    job.locations
      .map((location) => location.displayName || location.name)
      .filter(Boolean)
      .join(", ") ||
    job.longLocation ||
    job.shortLocation ||
    job.location ||
    job.country ||
    "Location not provided"
  )
}

function jobSalary(job: TheirStackJob) {
  if (job.salaryString) return job.salaryString
  if (job.minAnnualSalaryUsd != null && job.maxAnnualSalaryUsd != null) {
    return `${formatUsd(job.minAnnualSalaryUsd)} - ${formatUsd(job.maxAnnualSalaryUsd)}`
  }
  if (job.avgAnnualSalaryUsd != null) return `${formatUsd(job.avgAnnualSalaryUsd)} average`
  return "Salary not provided"
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatJobDate(value?: string | null) {
  if (!value) return "Not provided"
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : format(date, "MMM d, yyyy")
}

function formatPostedLabel(value?: string | null) {
  return value ? `Posted ${formatJobDate(value)}` : "Posted date not provided"
}

function sourceDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "")
  } catch {
    return "Job source"
  }
}

function titleFromSlug(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}
