import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import {
  ArrowLeft,
  BadgeDollarSign,
  Bookmark,
  BookmarkPlus,
  Brain,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Columns3,
  Copy,
  ExternalLink,
  Eye,
  Globe2,
  Link2,
  LoaderCircle,
  Laptop,
  MapPin,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  TextSearch,
  Tags,
  Trash2,
  UserRound,
  X,
} from "lucide-react"
import { format } from "date-fns"
import type { DateRange } from "react-day-picker"
import { openUrl } from "@tauri-apps/plugin-opener"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  deleteSavedTheirStackSearch,
  revealTheirStackJob,
  expandTheirStackSearchQuery,
  listSavedTheirStackSearches,
  saveTheirStackSearch,
  searchTheirStackJobs,
  searchTheirStackIndustries,
  searchTheirStackKeywords,
  searchTheirStackLocations,
  searchTheirStackTechnologies,
  THEIRSTACK_JOB_PAGE_SIZE,
  toTheirStackPostedDateParams,
  type PostedDateFilter,
  type TheirStackIndustry,
  type TheirStackJob,
  type TheirStackJobSearchRequest,
  type TheirStackKeyword,
  type TheirStackLocation,
  type TheirStackSavedSearch,
  type TheirStackSearchQuery,
  type TheirStackSearchQueryExpansion,
  type TheirStackTechnology,
} from "@/lib/theirstack"
import {
  CODEX_MODELS,
  CODEX_REASONING_LEVELS,
  DEFAULT_CODEX_MODEL_ID,
  type AgentModel,
  type CodexReasoningLevel,
} from "@/lib/agent-models"
import { cn } from "@/lib/utils"

const postedDatePresets = [
  { label: "Today", maxAgeDays: 0 },
  { label: "Today and yesterday", maxAgeDays: 1 },
  { label: "Last 7 days", maxAgeDays: 7 },
  { label: "Last 15 days", maxAgeDays: 15 },
  { label: "Last 30 days", maxAgeDays: 30 },
  { label: "Last 3 months", maxAgeDays: 90 },
  { label: "Last 12 months", maxAgeDays: 365 },
] as const

const defaultPostedDate: PostedDateFilter = { kind: "relative", maxAgeDays: 15 }
const DEFAULT_PRE_SEARCH_REASONING: CodexReasoningLevel = "max"

export type JobSearchFilterValues = TheirStackJobSearchRequest

type SearchFormSnapshot = {
  postedDate: PostedDateFilter
  selectedLocations: TheirStackLocation[]
  selectedIndustries: TheirStackIndustry[]
  selectedTechnologies: TheirStackTechnology[]
  selectedKeywords: TheirStackKeyword[]
  locationRelation: "job_location_or" | "job_location_not"
  industryRelation: "industry_id_or" | "industry_id_not" | "industry_id_not_or_null"
  technologyRelation: "job_technology_slug_or" | "job_technology_slug_and" | "job_technology_slug_not"
  keywordRelation: "job_keyword_slug_or" | "job_keyword_slug_and" | "job_keyword_slug_not"
  jobTitle: string
  description: string
  additionalFilters: TheirStackJobSearchRequest
  activeAdditionalFilters: string[]
}

type SearchExecution = {
  filters: TheirStackJobSearchRequest
  query: TheirStackSearchQuery
  model: string
  reasoningEffort: CodexReasoningLevel
}

type SearchDraft = SearchExecution & {
  form: SearchFormSnapshot
}

export function JobSearchWorkspace({
  onSearch,
}: {
  onSearch?: (filters: JobSearchFilterValues) => void
} = {}) {
  const [postedDate, setPostedDate] = useState<PostedDateFilter>(defaultPostedDate)
  const [selectedLocations, setSelectedLocations] = useState<TheirStackLocation[]>([])
  const [selectedIndustries, setSelectedIndustries] = useState<TheirStackIndustry[]>([])
  const [selectedTechnologies, setSelectedTechnologies] = useState<TheirStackTechnology[]>([])
  const [selectedKeywords, setSelectedKeywords] = useState<TheirStackKeyword[]>([])
  const [locationRelation, setLocationRelation] = useState<"job_location_or" | "job_location_not">("job_location_or")
  const [industryRelation, setIndustryRelation] = useState<"industry_id_or" | "industry_id_not" | "industry_id_not_or_null">("industry_id_or")
  const [technologyRelation, setTechnologyRelation] = useState<"job_technology_slug_or" | "job_technology_slug_and" | "job_technology_slug_not">("job_technology_slug_or")
  const [keywordRelation, setKeywordRelation] = useState<"job_keyword_slug_or" | "job_keyword_slug_and" | "job_keyword_slug_not">("job_keyword_slug_or")
  const [jobTitle, setJobTitle] = useState("")
  const [description, setDescription] = useState("")
  const [additionalFilters, setAdditionalFilters] = useState<TheirStackJobSearchRequest>({})
  const [activeAdditionalFilters, setActiveAdditionalFilters] = useState<AdvancedFilterId[]>([])
  const [preSearchModel, setPreSearchModel] = useState(DEFAULT_CODEX_MODEL_ID)
  const [preSearchReasoning, setPreSearchReasoning] = useState<CodexReasoningLevel>(DEFAULT_PRE_SEARCH_REASONING)
  const [hasSearched, setHasSearched] = useState(false)
  const [jobs, setJobs] = useState<TheirStackJob[]>([])
  const [searchFilters, setSearchFilters] = useState<TheirStackJobSearchRequest | null>(null)
  const [searchPage, setSearchPage] = useState(0)
  const [searchPageSize, setSearchPageSize] = useState(THEIRSTACK_JOB_PAGE_SIZE)
  const [searchTotalResults, setSearchTotalResults] = useState<number | null>(null)
  const [hasMoreResults, setHasMoreResults] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchPhase, setSearchPhase] = useState<SearchPhase>("idle")
  const [searchExpansion, setSearchExpansion] = useState<TheirStackSearchQueryExpansion | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [revealingJobIds, setRevealingJobIds] = useState<number[]>([])
  const [selectedJob, setSelectedJob] = useState<TheirStackJob | null>(null)
  const [savedSearches, setSavedSearches] = useState<TheirStackSavedSearch[]>([])
  const [savedSearchesLoading, setSavedSearchesLoading] = useState(true)
  const [savedSearchesError, setSavedSearchesError] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveSearchName, setSaveSearchName] = useState("")
  const [pendingSaveDraft, setPendingSaveDraft] = useState<SearchDraft | null>(null)
  const [isSavingSearch, setIsSavingSearch] = useState(false)
  const [saveSearchError, setSaveSearchError] = useState<string | null>(null)
  const [searchToDelete, setSearchToDelete] = useState<TheirStackSavedSearch | null>(null)
  const [isDeletingSearch, setIsDeletingSearch] = useState(false)

  useEffect(() => {
    let active = true
    void listSavedTheirStackSearches()
      .then((searches) => {
        if (!active) return
        setSavedSearches(searches)
        setSavedSearchesError(null)
      })
      .catch((cause) => {
        if (!active) return
        setSavedSearchesError(errorMessage(cause, "Saved searches could not be loaded."))
      })
      .finally(() => {
        if (active) setSavedSearchesLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const locationSummary = useMemo(
    () => formatLocationSummary(selectedLocations),
    [selectedLocations],
  )
  const industrySummary = useMemo(
    () => formatCatalogSummary(selectedIndustries, industryLabel),
    [selectedIndustries],
  )
  const technologySummary = useMemo(
    () => formatCatalogSummary(selectedTechnologies, technologyLabel),
    [selectedTechnologies],
  )
  const keywordSummary = useMemo(
    () => formatCatalogSummary(selectedKeywords, technologyLabel),
    [selectedKeywords],
  )
  function setAdditionalField<K extends keyof TheirStackJobSearchRequest>(
    key: K,
    next: TheirStackJobSearchRequest[K] | undefined,
  ) {
    setAdditionalFilters((current) => {
      const copy = { ...current }
      if (!hasFilterValue(next)) delete copy[key]
      else copy[key] = next
      return copy
    })
  }

  function buildSearchDraft(): SearchDraft {
    const filters = compactRequest({
      ...additionalFilters,
      ...toTheirStackPostedDateParams(postedDate),
      ...(selectedLocations.length ? { [locationRelation]: selectedLocations.map((location) => ({ id: location.id })) } : {}),
      ...(selectedIndustries.length ? { [industryRelation]: selectedIndustries.map(industryKey) } : {}),
      ...(selectedTechnologies.length ? { [technologyRelation]: selectedTechnologies.map(technologyKey) } : {}),
      ...(selectedKeywords.length ? { [keywordRelation]: selectedKeywords.map(technologyKey) } : {}),
      ...(jobTitle.trim() ? { job_title_or: splitFilterTerms(jobTitle) } : {}),
      ...(description.trim() ? { job_description_contains_or: splitFilterTerms(description) } : {}),
    })
    return {
      filters,
      query: {
        jobTitle: jobTitle.trim() || undefined,
        description: description.trim() || undefined,
      },
      model: preSearchModel,
      reasoningEffort: preSearchReasoning,
      form: {
        postedDate,
        selectedLocations,
        selectedIndustries,
        selectedTechnologies,
        selectedKeywords,
        locationRelation,
        industryRelation,
        technologyRelation,
        keywordRelation,
        jobTitle,
        description,
        additionalFilters,
        activeAdditionalFilters,
      },
    }
  }

  async function executeSearch(draft: SearchExecution) {
    setHasSearched(true)
    setSelectedJob(null)
    setSearchFilters(null)
    setSearchPage(0)
    setSearchPageSize(THEIRSTACK_JOB_PAGE_SIZE)
    setSearchTotalResults(null)
    setHasMoreResults(false)
    setIsSearching(true)
    setSearchPhase("searching")
    setSearchExpansion(null)
    setSearchError(null)
    try {
      const pipeline = await runJobSearchPipeline(
        draft.filters,
        {
          jobTitle: draft.query.jobTitle ?? "",
          description: draft.query.description ?? "",
        },
        draft.model,
        draft.reasoningEffort,
        setSearchPhase,
      )
      onSearch?.(pipeline.filters)
      setSearchExpansion(pipeline.expansion)
      setJobs(pipeline.result.jobs)
      setSearchFilters(pipeline.filters)
      setSearchPage(pipeline.result.page)
      setSearchPageSize(pipeline.result.limit || THEIRSTACK_JOB_PAGE_SIZE)
      setSearchTotalResults(pipeline.result.totalResults ?? null)
      setHasMoreResults(pipeline.result.jobs.length >= (pipeline.result.limit || THEIRSTACK_JOB_PAGE_SIZE))
    } catch (cause) {
      setJobs([])
      setSearchFilters(null)
      setSearchError(errorMessage(cause, "TheirStack could not complete this search."))
    } finally {
      setIsSearching(false)
      setSearchPhase("idle")
    }
  }

  async function submitSearch() {
    await executeSearch(buildSearchDraft())
  }

  function openSaveSearchDialog() {
    const draft = buildSearchDraft()
    setPendingSaveDraft(draft)
    setSaveSearchName(defaultSavedSearchName(draft.query))
    setSaveSearchError(null)
    setSaveDialogOpen(true)
  }

  async function handleSaveSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pendingSaveDraft) return
    const name = saveSearchName.trim()
    if (!name) {
      setSaveSearchError("Give this search a name first.")
      return
    }

    setIsSavingSearch(true)
    setSaveSearchError(null)
    try {
      const saved = await saveTheirStackSearch({
        name,
        filters: pendingSaveDraft.filters,
        query: pendingSaveDraft.query,
        model: pendingSaveDraft.model,
        reasoningEffort: pendingSaveDraft.reasoningEffort,
        form: pendingSaveDraft.form as unknown as Record<string, unknown>,
      })
      setSavedSearches((current) => [saved, ...current])
      setSaveDialogOpen(false)
      setPendingSaveDraft(null)
    } catch (cause) {
      setSaveSearchError(errorMessage(cause, "The search could not be saved."))
    } finally {
      setIsSavingSearch(false)
    }
  }

  function restoreSearchFormSnapshot(value: Record<string, unknown> | null | undefined) {
    if (!isSearchFormSnapshot(value)) return
    setPostedDate(value.postedDate)
    setSelectedLocations(value.selectedLocations)
    setSelectedIndustries(value.selectedIndustries)
    setSelectedTechnologies(value.selectedTechnologies)
    setSelectedKeywords(value.selectedKeywords)
    setLocationRelation(value.locationRelation)
    setIndustryRelation(value.industryRelation)
    setTechnologyRelation(value.technologyRelation)
    setKeywordRelation(value.keywordRelation)
    setJobTitle(value.jobTitle)
    setDescription(value.description)
    setAdditionalFilters(value.additionalFilters)
    setActiveAdditionalFilters(value.activeAdditionalFilters as AdvancedFilterId[])
  }

  async function runSavedSearch(search: TheirStackSavedSearch) {
    const model = savedSearchModel(search.model)
    const reasoningEffort = savedSearchReasoning(search.reasoningEffort)
    restoreSearchFormSnapshot(search.form)
    setPreSearchModel(model)
    setPreSearchReasoning(reasoningEffort)
    await executeSearch({
      filters: compactRequest(search.filters),
      query: search.query ?? {},
      model,
      reasoningEffort,
    })
  }

  async function confirmDeleteSavedSearch() {
    if (!searchToDelete) return
    setIsDeletingSearch(true)
    setSavedSearchesError(null)
    try {
      await deleteSavedTheirStackSearch(searchToDelete.id)
      setSavedSearches((current) => current.filter((search) => search.id !== searchToDelete.id))
      setSearchToDelete(null)
    } catch (cause) {
      setSavedSearchesError(errorMessage(cause, "The saved search could not be deleted."))
    } finally {
      setIsDeletingSearch(false)
    }
  }

  async function goToSearchPage(nextPage: number) {
    if (isSearching || !searchFilters || nextPage < 0 || nextPage === searchPage) return

    const totalPages = searchTotalResults === null
      ? null
      : Math.max(1, Math.ceil(searchTotalResults / searchPageSize))
    if (totalPages !== null && nextPage >= totalPages) return
    if (totalPages === null && nextPage > searchPage && !hasMoreResults) return

    setSelectedJob(null)
    setIsSearching(true)
    setSearchPhase("searching")
    setSearchError(null)
    try {
      const result = await searchTheirStackJobs(searchFilters, nextPage)
      const pageSize = result.limit || searchPageSize || THEIRSTACK_JOB_PAGE_SIZE
      setJobs(result.jobs)
      setSearchPage(result.page)
      setSearchPageSize(pageSize)
      if (result.totalResults != null) setSearchTotalResults(result.totalResults)
      setHasMoreResults(result.jobs.length >= pageSize)
    } catch (cause) {
      setSearchError(errorMessage(cause, "TheirStack could not load this results page."))
    } finally {
      setIsSearching(false)
      setSearchPhase("idle")
    }
  }

  async function selectJob(job: TheirStackJob) {
    if (!job.hasBlurredData) {
      setSelectedJob(job)
      return
    }
    if (!job.datePosted || revealingJobIds.includes(job.id)) return
    setRevealingJobIds((current) => [...current, job.id])
    setSearchError(null)
    try {
      const revealed = await revealTheirStackJob(job.id, job.datePosted)
      setJobs((current) => current.map((candidate) => candidate.id === revealed.id ? revealed : candidate))
      setSelectedJob(revealed)
    } catch (cause) {
      setSearchError(errorMessage(cause, "TheirStack could not reveal this job."))
    } finally {
      setRevealingJobIds((current) => current.filter((id) => id !== job.id))
    }
  }

  return (
    <main className="flex min-h-svh flex-1 flex-col overflow-hidden bg-muted/20">
      <header className="border-b bg-background px-5 py-5 md:px-8 md:py-7">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="secondary" className="font-normal">
                <Sparkles data-icon="inline-start" /> Powered by TheirStack
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Find your next opportunity
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
              Search fresh roles across thousands of company career pages. Results
              stay blurred until you choose a specific job to reveal.
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl space-y-5 px-5 py-5 md:px-8 md:py-7">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <JobSearchModelPicker
                value={preSearchModel}
                onChange={setPreSearchModel}
                disabled={isSearching}
              />
              <JobSearchReasoningPicker
                value={preSearchReasoning}
                onChange={setPreSearchReasoning}
                disabled={isSearching}
              />
              <Button
                className="h-9 px-4"
                onClick={submitSearch}
                disabled={isSearching}
              >
                {isSearching ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Search data-icon="inline-start" />}
                {isSearching ? (searchPhase === "expanding" ? "Widening search…" : "Searching…") : "Search jobs"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <SavedSearchesPopover
                searches={savedSearches}
                loading={savedSearchesLoading}
                error={savedSearchesError}
                disabled={isSearching}
                deletingSearchId={isDeletingSearch ? searchToDelete?.id : null}
                onRun={(search) => { void runSavedSearch(search) }}
                onDelete={setSearchToDelete}
              />
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={openSaveSearchDialog}
                disabled={isSearching}
              >
                <BookmarkPlus data-icon="inline-start" /> Save search
              </Button>
            </div>

            <Card className="overflow-visible py-0">
              <CardContent className="p-3 md:p-4">
                <div className="flex flex-wrap items-center gap-2">
                <PostedDatePopover value={postedDate} onChange={setPostedDate} />

                <FilterPopover
                  icon={<MapPin />}
                  label="Location"
                  value={locationSummary}
                  contentClassName="w-[min(29rem,calc(100vw-2rem))]"
                >
                  <LocationCatalogPicker
                    selected={selectedLocations}
                    onChange={setSelectedLocations}
                    relation={locationRelation}
                    onRelationChange={setLocationRelation}
                  />
                </FilterPopover>

                <FilterPopover
                  icon={<Building2 />}
                  label="Industry"
                  value={industrySummary}
                  contentClassName="w-[min(29rem,calc(100vw-2rem))]"
                >
                  <IndustryCatalogPicker
                    selected={selectedIndustries}
                    onChange={setSelectedIndustries}
                    relation={industryRelation}
                    onRelationChange={setIndustryRelation}
                  />
                </FilterPopover>

                <FilterPopover
                  icon={<Laptop />}
                  label="Technologies"
                  value={technologySummary}
                  contentClassName="w-[min(29rem,calc(100vw-2rem))]"
                >
                  <TechnologyCatalogPicker
                    selected={selectedTechnologies}
                    onChange={setSelectedTechnologies}
                    relation={technologyRelation}
                    onRelationChange={setTechnologyRelation}
                  />
                </FilterPopover>

                <TextFilterPopover
                  icon={<TextSearch />}
                  label="Job title"
                  value={jobTitle}
                  onChange={(value) => { setJobTitle(value); setSearchExpansion(null) }}
                  placeholder="e.g. Product designer"
                >
                  <TokenField label="Exclude title keywords" value={additionalFilters.job_title_not} onChange={(next) => setAdditionalField("job_title_not", next)} placeholder="manager" />
                  <AdvancedPatternFields prefix="job_title_pattern" value={additionalFilters} setField={setAdditionalField} />
                </TextFilterPopover>

                <FilterPopover
                  icon={<Tags />}
                  label="Keywords"
                  value={keywordSummary}
                  contentClassName="w-[min(29rem,calc(100vw-2rem))]"
                >
                  <KeywordCatalogPicker
                    selected={selectedKeywords}
                    onChange={setSelectedKeywords}
                    relation={keywordRelation}
                    onRelationChange={setKeywordRelation}
                  />
                </FilterPopover>
                <TextFilterPopover
                  icon={<TextSearch />}
                  label="Description"
                  value={description}
                  onChange={(value) => { setDescription(value); setSearchExpansion(null) }}
                  placeholder="e.g. React, fintech, AI"
                >
                  <TokenField label="Exclude whole words" value={additionalFilters.job_description_contains_not} onChange={(next) => setAdditionalField("job_description_contains_not", next)} placeholder="clearance" />
                  <AdvancedPatternFields prefix="job_description_pattern" value={additionalFilters} setField={setAdditionalField} />
                </TextFilterPopover>

                {activeAdditionalFilters.map((filterId) => (
                  <ActiveAdvancedFilter
                    key={filterId}
                    filterId={filterId}
                    value={additionalFilters}
                    onChange={setAdditionalFilters}
                    onRemove={() => setActiveAdditionalFilters((current) => current.filter((id) => id !== filterId))}
                  />
                ))}

                <AddFilterPopover
                  active={activeAdditionalFilters}
                  onAdd={(filterId) => setActiveAdditionalFilters((current) => current.includes(filterId) ? current : [...current, filterId])}
                />
                </div>
              </CardContent>
            </Card>
          </div>

          {searchExpansion ? <SearchExpansionNotice expansion={searchExpansion} /> : null}

          {searchError ? (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {searchError}
            </div>
          ) : null}

          {hasSearched && !isSearching ? (
            jobs.length ? (
              <JobResultsTable
                jobs={jobs}
                revealingJobIds={revealingJobIds}
                onSelect={selectJob}
                page={searchPage}
                pageSize={searchPageSize}
                totalResults={searchTotalResults}
                hasMoreResults={hasMoreResults}
                paginationDisabled={isSearching}
                onPageChange={goToSearchPage}
              />
            ) : !searchError ? (
              <Card className="items-center py-14 text-center">
                <BriefcaseBusiness className="size-8 text-muted-foreground" />
                <CardHeader className="w-full max-w-md items-center">
                  <CardTitle>No matching jobs</CardTitle>
                  <CardDescription>Try widening one or more filters.</CardDescription>
                </CardHeader>
              </Card>
            ) : null
          ) : !hasSearched ? (
            <Card className="items-center py-16 text-center">
              <Search className="size-8 text-muted-foreground" />
              <CardHeader className="w-full max-w-md items-center">
                <CardTitle>Start with a search</CardTitle>
                <CardDescription>Choose filters above to find up to 20 matching roles.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <JobTableLoading />
          )}
        </div>
      </div>
      <Dialog
        open={saveDialogOpen}
        onOpenChange={(open) => {
          setSaveDialogOpen(open)
          if (!open && !isSavingSearch) {
            setPendingSaveDraft(null)
            setSaveSearchError(null)
          }
        }}
      >
        <DialogContent>
          <form onSubmit={handleSaveSearch}>
            <DialogHeader>
              <DialogTitle>Save search</DialogTitle>
              <DialogDescription>
                Save the current filters and search expansion settings to run again later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="saved-search-name">Search name</Label>
              <Input
                id="saved-search-name"
                value={saveSearchName}
                onChange={(event) => setSaveSearchName(event.target.value)}
                placeholder="e.g. Senior product roles"
                maxLength={120}
                autoFocus
                disabled={isSavingSearch}
              />
              {saveSearchError ? (
                <p role="alert" className="text-sm text-destructive">{saveSearchError}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSaveDialogOpen(false)}
                disabled={isSavingSearch}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSavingSearch || !pendingSaveDraft}>
                {isSavingSearch ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <BookmarkPlus data-icon="inline-start" />}
                {isSavingSearch ? "Saving..." : "Save search"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(searchToDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeletingSearch) setSearchToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {searchToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved search from this device. It will not affect any jobs or applications.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingSearch}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeletingSearch}
              onClick={(event) => {
                event.preventDefault()
                void confirmDeleteSavedSearch()
              }}
            >
              {isDeletingSearch ? "Deleting..." : "Delete search"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <JobDetailDialog job={selectedJob} onClose={() => setSelectedJob(null)} />
    </main>
  )
}

function SavedSearchesPopover({
  searches,
  loading,
  error,
  disabled,
  deletingSearchId,
  onRun,
  onDelete,
}: {
  searches: TheirStackSavedSearch[]
  loading: boolean
  error: string | null
  disabled?: boolean
  deletingSearchId?: string | null
  onRun: (search: TheirStackSavedSearch) => void
  onDelete: (search: TheirStackSavedSearch) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={(nextOpen) => setOpen(!disabled && nextOpen)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9"
          aria-expanded={open}
          aria-haspopup="dialog"
          disabled={disabled}
        >
          <Bookmark data-icon="inline-start" />
          Saved searches
          {searches.length ? (
            <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-xs font-normal">
              {searches.length}
            </Badge>
          ) : null}
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(27rem,calc(100vw-2rem))] overflow-hidden p-0">
        <PopoverHeader className="border-b px-3 py-3">
          <PopoverTitle>Saved searches</PopoverTitle>
          <PopoverDescription>
            Run a saved filter set again without rebuilding the search.
          </PopoverDescription>
        </PopoverHeader>
        {error ? (
          <div role="alert" className="border-b bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="animate-spin" /> Loading saved searches...
          </div>
        ) : searches.length ? (
          <ScrollArea className="max-h-80">
            <div className="space-y-0.5 p-2">
              {searches.map((search) => (
                <div key={search.id} className="flex items-center gap-1 rounded-md hover:bg-muted">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto min-w-0 flex-1 justify-start px-2.5 py-2 text-left font-normal"
                    onClick={() => {
                      setOpen(false)
                      onRun(search)
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{search.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {savedSearchSummary(search)} · saved {formatSavedSearchDate(search.updatedAt)}
                      </span>
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mr-1 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${search.name}`}
                    title="Delete saved search"
                    disabled={deletingSearchId === search.id}
                    onClick={() => onDelete(search)}
                  >
                    {deletingSearchId === search.id ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No saved searches yet. Save the current filters to make them reusable.
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

function defaultSavedSearchName(query: TheirStackSearchQuery) {
  const source = query.jobTitle?.trim() || query.description?.trim()
  if (!source) return "My job search"
  const firstLine = source.split(/[\n,]/)[0]?.trim() || source
  return firstLine.slice(0, 120)
}

function savedSearchSummary(search: TheirStackSavedSearch) {
  const query = [search.query?.jobTitle, search.query?.description]
    .map((value) => value?.trim())
    .filter(Boolean)
  if (query.length) return query.join(" · ")
  const filterCount = Object.keys(search.filters ?? {}).length
  return filterCount ? `${filterCount} saved filters` : "Saved search"
}

function formatSavedSearchDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "recently" : format(date, "MMM d, yyyy")
}

function savedSearchModel(value: string | null | undefined) {
  return CODEX_MODELS.some((model) => model.id === value)
    ? value as string
    : DEFAULT_CODEX_MODEL_ID
}

function savedSearchReasoning(value: string | null | undefined): CodexReasoningLevel {
  return CODEX_REASONING_LEVELS.some((option) => option.id === value)
    ? value as CodexReasoningLevel
    : DEFAULT_PRE_SEARCH_REASONING
}

function isSearchFormSnapshot(value: unknown): value is SearchFormSnapshot {
  if (!value || typeof value !== "object") return false
  const snapshot = value as Partial<SearchFormSnapshot>
  return Boolean(
    snapshot.postedDate &&
      Array.isArray(snapshot.selectedLocations) &&
      Array.isArray(snapshot.selectedIndustries) &&
      Array.isArray(snapshot.selectedTechnologies) &&
      Array.isArray(snapshot.selectedKeywords) &&
      typeof snapshot.jobTitle === "string" &&
      typeof snapshot.description === "string" &&
      snapshot.additionalFilters &&
      typeof snapshot.additionalFilters === "object" &&
      Array.isArray(snapshot.activeAdditionalFilters),
  )
}

function JobSearchModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selectedModel = CODEX_MODELS.find((model) => model.id === value) ?? CODEX_MODELS[0]

  function selectModel(model: AgentModel) {
    onChange(model.id)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(nextOpen) => setOpen(!disabled && nextOpen)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 max-w-full min-w-0 justify-between font-normal"
          aria-expanded={open}
          aria-haspopup="dialog"
          disabled={disabled}
        >
          <Sparkles className="text-primary" />
          <span className="hidden text-muted-foreground sm:inline">Pre-search:</span>
          <span className="max-w-32 truncate">{selectedModel.name}</span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(23rem,calc(100vw-2rem))] overflow-hidden p-0"
      >
        <PopoverHeader className="border-b px-3 py-3">
          <PopoverTitle>Pre-search model</PopoverTitle>
          <PopoverDescription>
            Codex uses this model for regex expansion and future search-preparation actions.
          </PopoverDescription>
        </PopoverHeader>
        <Command>
          <CommandInput placeholder="Search Codex models..." />
          <CommandList>
            <CommandEmpty>No matching Codex models.</CommandEmpty>
            <CommandGroup heading="Codex models">
              {CODEX_MODELS.map((model) => (
                <CommandItem
                  key={model.id}
                  value={`${model.name} ${model.id}`}
                  data-checked={model.id === selectedModel.id}
                  onSelect={() => selectModel(model)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{model.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{model.id}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function JobSearchReasoningPicker({
  value,
  onChange,
  disabled,
}: {
  value: CodexReasoningLevel
  onChange: (value: CodexReasoningLevel) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selectedReasoning = CODEX_REASONING_LEVELS.find((option) => option.id === value) ?? CODEX_REASONING_LEVELS[0]

  return (
    <Popover open={open} onOpenChange={(nextOpen) => setOpen(!disabled && nextOpen)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 max-w-full min-w-0 justify-between font-normal"
          aria-expanded={open}
          aria-haspopup="menu"
          disabled={disabled}
        >
          <Brain className="text-primary" />
          <span className="hidden text-muted-foreground sm:inline">Reasoning:</span>
          <span>{selectedReasoning.label}</span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <PopoverHeader className="border-b px-3 py-3">
          <PopoverTitle>Pre-search reasoning</PopoverTitle>
          <PopoverDescription>
            Choose how much reasoning Codex uses to widen natural-language searches.
          </PopoverDescription>
        </PopoverHeader>
        <div className="space-y-0.5 p-2" role="menu" aria-label="Pre-search reasoning">
          {CODEX_REASONING_LEVELS.map((option) => (
            <Button
              key={option.id}
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between px-2.5 py-2 text-left font-normal"
              onClick={() => { onChange(option.id); setOpen(false) }}
              role="menuitemradio"
              aria-checked={option.id === value}
            >
              <span className="flex items-center gap-3">
                <span className="flex size-4 items-center justify-center">
                  {option.id === value ? <Check className="size-4" /> : null}
                </span>
                {option.label}
              </span>
              {option.isDefault ? <span className="text-xs text-muted-foreground">Default</span> : null}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function PostedDatePopover({
  value,
  onChange,
}: {
  value: PostedDateFilter
  onChange: (value: PostedDateFilter) => void
}) {
  const [open, setOpen] = useState(false)
  const [showCustomRange, setShowCustomRange] = useState(false)
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(() =>
    dateRangeFromFilter(value),
  )
  const today = startOfLocalDay(new Date())

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) setShowCustomRange(false)
  }

  function selectPreset(maxAgeDays: (typeof postedDatePresets)[number]["maxAgeDays"]) {
    onChange({ kind: "relative", maxAgeDays })
    setOpen(false)
  }

  function openCustomRange() {
    setDraftRange(dateRangeFromFilter(value))
    setShowCustomRange(true)
  }

  function applyCustomRange() {
    if (!draftRange?.from) return
    const first = startOfLocalDay(draftRange.from)
    const second = startOfLocalDay(draftRange.to ?? draftRange.from)
    const [from, to] = first <= second ? [first, second] : [second, first]
    onChange({
      kind: "range",
      from: formatDateForApi(from),
      to: formatDateForApi(to),
    })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 max-w-full">
          <CalendarDays />
          <span className="hidden text-muted-foreground sm:inline">Posted date:</span>
          <span className="max-w-48 truncate">{formatPostedDateLabel(value)}</span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(24rem,calc(100vw-2rem))]"
      >
        {showCustomRange ? (
          <>
            <PopoverHeader className="px-1 pb-1">
              <PopoverTitle className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Back to posted date presets"
                  className="rounded-md p-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setShowCustomRange(false)}
                >
                  <ArrowLeft className="size-4" />
                </button>
                Custom date range
              </PopoverTitle>
              <PopoverDescription>
                Include jobs posted on or between the selected dates.
              </PopoverDescription>
            </PopoverHeader>
            <Calendar
              mode="range"
              selected={draftRange}
              onSelect={setDraftRange}
              defaultMonth={draftRange?.from ?? today}
              disabled={{ after: today }}
              className="mx-auto"
            />
            <Separator />
            <div className="flex items-center justify-between gap-3 px-1">
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {formatDraftDateRange(draftRange)}
              </span>
              <Button size="sm" disabled={!draftRange?.from} onClick={applyCustomRange}>
                Apply
              </Button>
            </div>
          </>
        ) : (
          <>
            <PopoverHeader className="px-1 pb-2">
              <PopoverTitle className="flex items-center gap-2">
                <CalendarDays className="size-4" /> Posted date
              </PopoverTitle>
              <PopoverDescription>
                Date when the job was posted on a job board or company website.
              </PopoverDescription>
            </PopoverHeader>
            <div className="space-y-0.5">
              {postedDatePresets.map((option) => (
                <FilterOption
                  key={option.maxAgeDays}
                  selected={
                    value.kind === "relative" &&
                    value.maxAgeDays === option.maxAgeDays
                  }
                  onClick={() => selectPreset(option.maxAgeDays)}
                >
                  {option.label}
                </FilterOption>
              ))}
            </div>
            <Separator />
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left hover:bg-muted",
                value.kind === "range" && "bg-muted",
              )}
              onClick={openCustomRange}
            >
              <span className="flex items-center gap-3">
                <span className="flex size-4 items-center justify-center">
                  {value.kind === "range" ? <Check className="size-4" /> : null}
                </span>
                Custom date range
              </span>
              <ChevronDown className="size-4 -rotate-90" />
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

function formatPostedDateLabel(value: PostedDateFilter) {
  if (value.kind === "relative") {
    return (
      postedDatePresets.find((option) => option.maxAgeDays === value.maxAgeDays)
        ?.label ?? `Last ${value.maxAgeDays} days`
    )
  }

  const from = parseApiDate(value.from)
  const to = parseApiDate(value.to)
  if (value.from === value.to) return format(from, "MMM d, yyyy")
  return `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`
}

function formatDraftDateRange(range: DateRange | undefined) {
  if (!range?.from) return "Select a start date"
  if (!range.to) return `${format(range.from, "MMM d, yyyy")} (one day)`
  return `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`
}

function dateRangeFromFilter(value: PostedDateFilter): DateRange | undefined {
  if (value.kind !== "range") return undefined
  return { from: parseApiDate(value.from), to: parseApiDate(value.to) }
}

function parseApiDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function formatDateForApi(value: Date) {
  return format(value, "yyyy-MM-dd")
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function FilterPopover({
  icon,
  label,
  value,
  contentClassName,
  children,
}: {
  icon: ReactNode
  label: string
  value?: string
  contentClassName?: string
  children: ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 max-w-full">
          {icon}
          <span className="hidden text-muted-foreground sm:inline">{label}:</span>
          {value ? <span className="max-w-48 truncate">{value}</span> : label}
          <ChevronDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={contentClassName}>
        {children}
      </PopoverContent>
    </Popover>
  )
}

function LocationCatalogPicker({
  selected,
  onChange,
  relation,
  onRelationChange,
}: {
  selected: TheirStackLocation[]
  onChange: (locations: TheirStackLocation[]) => void
  relation: "job_location_or" | "job_location_not"
  onRelationChange: (relation: "job_location_or" | "job_location_not") => void
}) {
  return (
    <><RelationSelect label="Relationship" value={relation} onChange={(next) => onRelationChange(next as typeof relation)} options={[["job_location_or", "Include any"], ["job_location_not", "Exclude any"]]} /><CatalogPicker
      selected={selected}
      onChange={onChange}
      search={searchTheirStackLocations}
      getKey={locationKey}
      getLabel={locationLabel}
      getScope={locationScope}
      getLeading={locationFlag}
      icon={<MapPin className="size-4" />}
      title="Job location"
      relation={relation === "job_location_or" ? "includes any" : "excludes any"}
      description="Select one or more standardized locations from TheirStack."
      placeholder="Search cities, regions, or countries…"
      addPlaceholder="Add more locations…"
      clearSearchLabel="Clear location search"
      emptyLabel="No matching locations found."
      noun="location"
    /></>
  )
}

function IndustryCatalogPicker({
  selected,
  onChange,
  relation,
  onRelationChange,
}: {
  selected: TheirStackIndustry[]
  onChange: (industries: TheirStackIndustry[]) => void
  relation: "industry_id_or" | "industry_id_not" | "industry_id_not_or_null"
  onRelationChange: (relation: "industry_id_or" | "industry_id_not" | "industry_id_not_or_null") => void
}) {
  return (
    <><RelationSelect label="Relationship" value={relation} onChange={(next) => onRelationChange(next as typeof relation)} options={[["industry_id_or", "Include any"], ["industry_id_not", "Exclude any"], ["industry_id_not_or_null", "Exclude, keep unknown"]]} /><CatalogPicker
      selected={selected}
      onChange={onChange}
      search={searchTheirStackIndustries}
      getKey={industryKey}
      getLabel={industryLabel}
      getScope={industryScope}
      getLeading={industryLeading}
      icon={<Building2 className="size-4" />}
      title="Industry"
      relation={relation === "industry_id_or" ? "includes any" : relation === "industry_id_not" ? "excludes any" : "excludes, keeps unknown"}
      description="Search TheirStack's standardized LinkedIn industry catalog."
      placeholder="Search industries…"
      addPlaceholder="Add more industries…"
      clearSearchLabel="Clear industry search"
      emptyLabel="No matching industries found."
      noun="industry"
    /></>
  )
}

function TechnologyCatalogPicker({
  selected,
  onChange,
  relation,
  onRelationChange,
}: {
  selected: TheirStackTechnology[]
  onChange: (technologies: TheirStackTechnology[]) => void
  relation: "job_technology_slug_or" | "job_technology_slug_and" | "job_technology_slug_not"
  onRelationChange: (relation: "job_technology_slug_or" | "job_technology_slug_and" | "job_technology_slug_not") => void
}) {
  return (
    <><RelationSelect label="Relationship" value={relation} onChange={(next) => onRelationChange(next as typeof relation)} options={[["job_technology_slug_or", "Include any"], ["job_technology_slug_and", "Include all"], ["job_technology_slug_not", "Exclude any"]]} /><CatalogPicker
      selected={selected}
      onChange={onChange}
      search={searchTheirStackTechnologies}
      getKey={technologyKey}
      getLabel={technologyLabel}
      getScope={technologyScope}
      getLeading={technologyLeading}
      icon={<Laptop className="size-4" />}
      title="Technologies"
      relation={relation === "job_technology_slug_and" ? "includes all" : relation === "job_technology_slug_not" ? "excludes any" : "includes any"}
      description="Search technology keywords tracked by TheirStack."
      placeholder="Search technologies…"
      addPlaceholder="Add more technologies…"
      clearSearchLabel="Clear technology search"
      emptyLabel="No matching technologies found."
      noun="technology"
      debounceMs={200}
    /></>
  )
}

function KeywordCatalogPicker({
  selected,
  onChange,
  title = "Job keywords",
  description = "Search all keywords tracked in TheirStack's catalog.",
  relation,
  onRelationChange,
}: {
  selected: TheirStackKeyword[]
  onChange: (keywords: TheirStackKeyword[]) => void
  title?: string
  description?: string
  relation: "job_keyword_slug_or" | "job_keyword_slug_and" | "job_keyword_slug_not"
  onRelationChange: (relation: "job_keyword_slug_or" | "job_keyword_slug_and" | "job_keyword_slug_not") => void
}) {
  return (
    <><RelationSelect label="Relationship" value={relation} onChange={(next) => onRelationChange(next as typeof relation)} options={[["job_keyword_slug_or", "Include any"], ["job_keyword_slug_and", "Include all"], ["job_keyword_slug_not", "Exclude any"]]} /><CatalogPicker
      selected={selected}
      onChange={onChange}
      search={searchTheirStackKeywords}
      getKey={technologyKey}
      getLabel={technologyLabel}
      getScope={technologyScope}
      getLeading={keywordLeading}
      icon={<Tags className="size-4" />}
      title={title}
      relation={relation === "job_keyword_slug_and" ? "includes all" : relation === "job_keyword_slug_not" ? "excludes any" : "includes any"}
      description={description}
      placeholder="Search catalog keywords…"
      addPlaceholder="Add more keywords…"
      clearSearchLabel="Clear keyword search"
      emptyLabel="No matching keywords found."
      noun="keyword"
      debounceMs={200}
    /></>
  )
}

function RelationSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) {
  return <div className="mb-2 flex items-center justify-between gap-3"><Label>{label}</Label><NativeSelect value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([id, optionLabel]) => <NativeSelectOption key={id} value={id}>{optionLabel}</NativeSelectOption>)}</NativeSelect></div>
}

function CatalogPicker<Item>({
  selected,
  onChange,
  search,
  getKey,
  getLabel,
  getScope,
  getLeading,
  icon,
  title,
  relation,
  description,
  placeholder,
  addPlaceholder,
  clearSearchLabel,
  emptyLabel,
  noun,
  debounceMs = 250,
}: {
  selected: Item[]
  onChange: (items: Item[]) => void
  search: (query: string) => Promise<Item[]>
  getKey: (item: Item) => string | number
  getLabel: (item: Item) => string
  getScope: (item: Item) => string
  getLeading: (item: Item) => ReactNode
  icon: ReactNode
  title: string
  relation: string
  description: string
  placeholder: string
  addPlaceholder: string
  clearSearchLabel: string
  emptyLabel: string
  noun: string
  debounceMs?: number
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestIdRef.current
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const items = await search(query.trim())
        if (requestId === requestIdRef.current) setResults(items)
      } catch (searchError) {
        if (requestId === requestIdRef.current) {
          setResults([])
          setError(
            typeof searchError === "string"
              ? searchError
              : searchError instanceof Error
                ? searchError.message
                : `${title} results could not be loaded.`,
          )
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false)
      }
    }, debounceMs)

    return () => window.clearTimeout(timer)
  }, [debounceMs, query, search, title])

  const selectedKeys = useMemo(
    () => new Set(selected.map(getKey)),
    [getKey, selected],
  )

  function toggleItem(item: Item) {
    const key = getKey(item)
    if (selectedKeys.has(key)) {
      onChange(selected.filter((selectedItem) => getKey(selectedItem) !== key))
    } else {
      onChange([...selected, item])
    }
  }

  return (
    <>
      <PopoverHeader className="px-1 pb-1">
        <PopoverTitle className="flex items-center gap-2">
          {icon} {title}
          <Badge variant="secondary" className="ml-1 font-normal">
            {relation}
          </Badge>
        </PopoverTitle>
        <PopoverDescription>{description}</PopoverDescription>
      </PopoverHeader>

      <div className="rounded-lg border bg-background p-2 focus-within:ring-2 focus-within:ring-ring/30">
        {selected.length ? (
          <div className="mb-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {selected.map((item) => (
              <Badge
                key={getKey(item)}
                variant="secondary"
                className="h-8 max-w-full gap-1.5 rounded-md px-2 text-sm font-normal"
              >
                <span aria-hidden>{getLeading(item)}</span>
                <span className="truncate">{getLabel(item)}</span>
                <button
                  type="button"
                  aria-label={`Remove ${getLabel(item)}`}
                  className="ml-0.5 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => toggleItem(item)}
                >
                  <X className="size-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="relative">
          <Search className="absolute left-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={selected.length ? addPlaceholder : placeholder}
            className="h-8 w-full bg-transparent pl-7 pr-8 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          {loading ? (
            <LoaderCircle className="absolute right-1 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : query ? (
            <button
              type="button"
              aria-label={clearSearchLabel}
              className="absolute right-0 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              onClick={() => setQuery("")}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <ScrollArea className="h-60">
        <div className="space-y-0.5 pr-3">
          {error ? (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : !loading && results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </p>
          ) : (
            results.map((item) => {
              const isSelected = selectedKeys.has(getKey(item))
              return (
                <button
                  key={getKey(item)}
                  type="button"
                  aria-pressed={isSelected}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-muted",
                    isSelected && "bg-muted",
                  )}
                  onClick={() => toggleItem(item)}
                >
                  <span className="flex size-5 items-center justify-center text-base" aria-hidden>
                    {getLeading(item)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{getLabel(item)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {getScope(item)}
                    </span>
                  </span>
                  <span className="flex size-5 items-center justify-center">
                    {isSelected ? <Check className="size-4" /> : null}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>

      {selected.length ? (
        <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
          <span>{selected.length} {noun}{selected.length === 1 ? "" : "s"} selected</span>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => onChange([])}>
            Clear all
          </Button>
        </div>
      ) : null}
    </>
  )
}

function locationLabel(location: TheirStackLocation) {
  return location.displayName?.trim() || location.name
}

function locationKey(location: TheirStackLocation) {
  return location.id
}

function locationScope(location: TheirStackLocation) {
  const place = [location.admin1Name, location.countryName]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(", ")
  const type = location.featureName?.trim() || "Location"
  return place && place !== locationLabel(location) ? `${type} · ${place}` : type
}

function locationFlag(location: TheirStackLocation) {
  const code = location.countryCode?.toUpperCase()
  if (!code || !/^[A-Z]{2}$/.test(code)) return "🌐"
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)))
}

function industryKey(industry: TheirStackIndustry) {
  return industry.industryId
}

function industryLabel(industry: TheirStackIndustry) {
  return industry.industry
}

function industryScope(industry: TheirStackIndustry) {
  const hierarchy = industry.hierarchy?.trim()
  if (hierarchy && hierarchy !== industry.industry) return hierarchy
  return industry.description?.trim() || "Industry"
}

function industryLeading() {
  return <Building2 className="size-3.5 text-muted-foreground" />
}

function technologyKey(technology: TheirStackTechnology) {
  return technology.slug
}

function technologyLabel(technology: TheirStackTechnology) {
  return technology.name
}

function technologyScope(technology: TheirStackTechnology) {
  const categories = [technology.category, technology.parentCategory]
    .map((value) => value?.trim())
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
  return categories.join(" · ") || technology.oneLiner?.trim() || "Technology"
}

function technologyLeading() {
  return <Laptop className="size-3.5 text-muted-foreground" />
}

function keywordLeading() {
  return <Tags className="size-3.5 text-muted-foreground" />
}

function formatLocationSummary(locations: TheirStackLocation[]) {
  if (!locations.length) return ""
  const first = locationLabel(locations[0])
  return locations.length === 1 ? first : `${first} + ${locations.length - 1}`
}

function formatCatalogSummary<Item>(items: Item[], getLabel: (item: Item) => string) {
  if (!items.length) return ""
  const first = getLabel(items[0])
  return items.length === 1 ? first : `${first} + ${items.length - 1}`
}

function TextFilterPopover({
  icon,
  label,
  value,
  onChange,
  placeholder,
  children,
}: {
  icon: ReactNode
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  children?: ReactNode
}) {
  return (
    <FilterPopover icon={icon} label={label} value={value || undefined}>
      <PopoverHeader>
        <PopoverTitle>{label}</PopoverTitle>
        <PopoverDescription>
          Codex expands this text into a broader regex before TheirStack searches
          matching {label.toLowerCase()} fields.
        </PopoverDescription>
      </PopoverHeader>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus
      />
      {children}
      {value ? (
        <Button variant="ghost" size="sm" className="w-fit" onClick={() => onChange("")}>
          <X data-icon="inline-start" /> Clear
        </Button>
      ) : null}
    </FilterPopover>
  )
}

const employmentOptions = [
  ["full_time", "Full time"], ["part_time", "Part time"], ["temporary", "Temporary"],
  ["internship", "Internship"], ["contract", "Contract"], ["freelance", "Freelance"],
  ["co_founder", "Co-founder"], ["apprenticeship", "Apprenticeship"],
  ["seasonal", "Seasonal"], ["volunteer", "Volunteer"], ["other", "Other"],
] as const

const workplaceOptions = [
  ["on_site", "On-site"], ["hybrid", "Hybrid"], ["remote", "Remote"],
] as const

const seniorityOptions = [
  ["c_level", "C-level"], ["staff", "Staff"], ["senior", "Senior"],
  ["mid_level", "Mid-level"], ["junior", "Junior"],
] as const

const propertyOptions = [
  ["company_object.domain", "Company domain"],
  ["company_object.linkedin_url", "Company LinkedIn URL"],
  ["final_url", "Direct application URL"],
  ["hiring_team", "Hiring team"],
  ["employment_statuses", "Employment status"],
] as const

const fundingStages = "angel convertible_note debt_financing equity_crowdfunding other private_equity seed series_a series_b series_c series_d series_e series_f series_g series_h venture_round_not_specified series_i series_j undisclosed series_unknown pre_seed post_ipo_secondary post_ipo_equity post_ipo_debt non_equity_assistance late_vc initial_coin_offering growth_equity_vc grant early_vc corporate_round secondary_market product_crowdfunding"
  .split(" ").map((value) => [value, titleFromSlug(value)] as const)

const isoCountryCodes = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ")

function splitFilterTerms(value: string) {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)
}

function hasFilterValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false
  if (Array.isArray(value)) return value.length > 0
  return true
}

function compactRequest(value: TheirStackJobSearchRequest): TheirStackJobSearchRequest {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => hasFilterValue(fieldValue)),
  ) as TheirStackJobSearchRequest
}

function titleFromSlug(value: string) {
  return value.split(/[_-]+/).map((word) => word === "vc" || word === "ipo" ? word.toUpperCase() : `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ")
}

type AdvancedFilterId =
  | "discovered_date" | "job_country" | "annual_salary" | "workplace_type"
  | "employment_status" | "seniority" | "easy_apply" | "job_status" | "closed_date"
  | "source_domains" | "required_data" | "job_ids" | "export_keys"
  | "company_name" | "company_identifiers" | "company_domain" | "company_description"
  | "employee_count" | "revenue" | "funding" | "investors" | "company_tags"
  | "company_type" | "yc_company" | "hq_city" | "hq_country" | "company_lists"
  | "company_technologies" | "company_keywords"

type FilterDefinition = { id: AdvancedFilterId | string; label: string; group: "job" | "company"; added?: boolean }

const filterDefinitions: FilterDefinition[] = [
  { id: "posted_date", label: "Posted date", group: "job", added: true },
  { id: "discovered_date", label: "Discovered date", group: "job" },
  { id: "job_country", label: "Job country", group: "job" },
  { id: "job_location", label: "Job location", group: "job", added: true },
  { id: "job_title", label: "Job title", group: "job", added: true },
  { id: "job_description", label: "Job description", group: "job", added: true },
  { id: "annual_salary", label: "Annual salary (USD)", group: "job" },
  { id: "workplace_type", label: "Workplace type", group: "job" },
  { id: "employment_status", label: "Employment status", group: "job" },
  { id: "seniority", label: "Job seniority", group: "job" },
  { id: "technologies", label: "Job technologies", group: "job", added: true },
  { id: "keywords", label: "Job keywords", group: "job", added: true },
  { id: "easy_apply", label: "Easy apply", group: "job" },
  { id: "job_status", label: "Open or closed", group: "job" },
  { id: "closed_date", label: "Closed date", group: "job" },
  { id: "source_domains", label: "Job source domains", group: "job" },
  { id: "required_data", label: "Required job data", group: "job" },
  { id: "job_ids", label: "Job IDs", group: "job" },
  { id: "export_keys", label: "Export batch keys", group: "job" },
  { id: "company_name", label: "Company name", group: "company" },
  { id: "company_identifiers", label: "Company IDs & LinkedIn", group: "company" },
  { id: "company_domain", label: "Company domain", group: "company" },
  { id: "company_description", label: "Company description", group: "company" },
  { id: "employee_count", label: "Employee count", group: "company" },
  { id: "revenue", label: "Annual revenue", group: "company" },
  { id: "funding", label: "Funding", group: "company" },
  { id: "investors", label: "Investors", group: "company" },
  { id: "industry", label: "Industry", group: "company", added: true },
  { id: "company_tags", label: "Company tags", group: "company" },
  { id: "company_type", label: "Company type", group: "company" },
  { id: "yc_company", label: "Y Combinator", group: "company" },
  { id: "hq_city", label: "HQ city", group: "company" },
  { id: "hq_country", label: "HQ country", group: "company" },
  { id: "company_lists", label: "Company lists", group: "company" },
  { id: "company_technologies", label: "Company technologies", group: "company" },
  { id: "company_keywords", label: "Company keywords", group: "company" },
]

const advancedFilterFields: Record<AdvancedFilterId, (keyof TheirStackJobSearchRequest)[]> = {
  discovered_date: ["discovered_at_gte", "discovered_at_lte", "discovered_at_min_age_days", "discovered_at_max_age_days"],
  job_country: ["job_country_code_or", "job_country_code_not"], annual_salary: ["min_salary_usd", "max_salary_usd"],
  workplace_type: ["workplace_types_or"], employment_status: ["employment_statuses_or"], seniority: ["job_seniority_or"],
  easy_apply: ["easy_apply"], job_status: ["is_closed"], closed_date: ["closed_at_gte", "closed_at_lte"],
  source_domains: ["url_domain_or", "url_domain_not"], required_data: ["property_exists_or", "property_exists_and"],
  job_ids: ["job_id_or", "job_id_not"], export_keys: ["job_export_key_or"],
  company_name: ["company_name_or", "company_name_case_insensitive_or", "company_name_not", "company_name_partial_match_or", "company_name_partial_match_not"],
  company_identifiers: ["company_id_or", "company_id_not", "company_linkedin_url_or"], company_domain: ["company_domain_or", "company_domain_not"],
  company_description: ["company_description_pattern_or", "company_description_pattern_not", "company_description_pattern_accent_insensitive"],
  employee_count: ["min_employee_count", "max_employee_count", "min_employee_count_or_null", "max_employee_count_or_null"],
  revenue: ["min_revenue_usd", "max_revenue_usd"], funding: ["min_funding_usd", "max_funding_usd", "funding_stage_or", "last_funding_round_date_gte", "last_funding_round_date_lte"],
  investors: ["company_investors_or", "company_investors_partial_match_or"], company_tags: ["company_tags_or"], company_type: ["company_type"],
  yc_company: ["only_yc_companies"], hq_city: ["company_location_pattern_or"],
  hq_country: ["company_country_code_or", "company_country_code_not", "company_country_code_not_or_null"],
  company_lists: ["company_list_id_or", "company_list_id_not"],
  company_technologies: ["company_technology_slug_or", "company_technology_slug_and", "company_technology_slug_not"],
  company_keywords: ["company_keyword_slug_or", "company_keyword_slug_and", "company_keyword_slug_not"],
}

function AddFilterPopover({ active, onAdd }: { active: AdvancedFilterId[]; onAdd: (id: AdvancedFilterId) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState<"job" | "company">("job")
  const matches = filterDefinitions.filter((definition) => definition.group === group && definition.label.toLowerCase().includes(query.trim().toLowerCase()))
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}><PopoverTrigger asChild><Button variant="ghost" className="h-9"><Plus data-icon="inline-start" /> Add filter</Button></PopoverTrigger><PopoverContent align="start" className="w-[min(31rem,calc(100vw-2rem))] p-0"><div className="border-b p-3"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type filter…" className="pl-9" autoFocus /></div></div><div className="grid grid-cols-2 border-b p-2"><FilterCategoryButton active={group === "job"} onClick={() => setGroup("job")} icon={<BriefcaseBusiness />} label="Job Posting" count={19} /><FilterCategoryButton active={group === "company"} onClick={() => setGroup("company")} icon={<Building2 />} label="Company" count={17} /></div><ScrollArea className="h-80"><div className="p-2"><p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group === "job" ? "Job Posting" : "Company"}</p>{matches.map((definition) => { const selected = definition.added || active.includes(definition.id as AdvancedFilterId); return <button key={definition.id} type="button" disabled={selected} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left hover:bg-muted disabled:cursor-default disabled:text-muted-foreground disabled:opacity-60" onClick={() => { onAdd(definition.id as AdvancedFilterId); setOpen(false) }}><span className="flex size-5 items-center justify-center">{selected ? <Check className="size-4" /> : <SlidersHorizontal className="size-4" />}</span><span className="flex-1">{definition.label}</span></button> })}</div></ScrollArea></PopoverContent></Popover>
}

function FilterCategoryButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count: number }) {
  return <button type="button" className={cn("rounded-md px-3 py-3 text-center text-xs text-muted-foreground hover:bg-muted", active && "bg-muted text-foreground")} onClick={onClick}><span className="mx-auto mb-1.5 block w-fit [&_svg]:size-5">{icon}</span>{label} ({count})</button>
}

function ActiveAdvancedFilter({ filterId, value, onChange, onRemove }: { filterId: AdvancedFilterId; value: TheirStackJobSearchRequest; onChange: (value: TheirStackJobSearchRequest) => void; onRemove: () => void }) {
  const definition = filterDefinitions.find((item) => item.id === filterId)!
  const activeFields = advancedFilterFields[filterId].filter((key) => hasFilterValue(value[key])).length
  function remove() { const copy = { ...value }; advancedFilterFields[filterId].forEach((key) => delete copy[key]); onChange(copy); onRemove() }
  return <FilterPopover icon={<SlidersHorizontal />} label={definition.label} value={activeFields ? `${activeFields} set` : undefined} contentClassName="w-[min(31rem,calc(100vw-2rem))]"><PopoverHeader><PopoverTitle>{definition.label}</PopoverTitle><PopoverDescription>Configure the corresponding TheirStack search fields.</PopoverDescription></PopoverHeader><AdvancedFilterEditor filterId={filterId} value={value} onChange={onChange} /><Separator /><Button variant="ghost" size="sm" className="w-fit text-destructive" onClick={remove}><X data-icon="inline-start" /> Remove filter</Button></FilterPopover>
}

function AdvancedFilterEditor({ filterId, value, onChange }: { filterId: AdvancedFilterId; value: TheirStackJobSearchRequest; onChange: (value: TheirStackJobSearchRequest) => void }) {
  const [keepUnknownCountry, setKeepUnknownCountry] = useState(Boolean(value.company_country_code_not_or_null))
  function setField<K extends keyof TheirStackJobSearchRequest>(key: K, next: TheirStackJobSearchRequest[K] | undefined) { const copy = { ...value }; if (!hasFilterValue(next)) delete copy[key]; else copy[key] = next; onChange(copy) }
  function setFields(patch: Partial<TheirStackJobSearchRequest>) { const copy = { ...value }; Object.entries(patch).forEach(([rawKey, next]) => { const key = rawKey as keyof TheirStackJobSearchRequest; if (!hasFilterValue(next)) delete copy[key]; else Object.assign(copy, { [key]: next }) }); onChange(copy) }
  switch (filterId) {
    case "discovered_date": return <><DatePair label="Discovered by TheirStack" from={value.discovered_at_gte} to={value.discovered_at_lte} onFrom={(next) => setField("discovered_at_gte", next)} onTo={(next) => setField("discovered_at_lte", next)} /><NumberPair label="Age in days" minLabel="Minimum age" maxLabel="Maximum age" min={value.discovered_at_min_age_days} max={value.discovered_at_max_age_days} onMin={(next) => setField("discovered_at_min_age_days", next)} onMax={(next) => setField("discovered_at_max_age_days", next)} /></>
    case "job_country": return <CountryFields include={value.job_country_code_or} exclude={value.job_country_code_not} onInclude={(next) => setField("job_country_code_or", next)} onExclude={(next) => setField("job_country_code_not", next)} />
    case "annual_salary": return <NumberPair label="Annual salary (USD)" min={value.min_salary_usd} max={value.max_salary_usd} onMin={(next) => setField("min_salary_usd", next)} onMax={(next) => setField("max_salary_usd", next)} currency />
    case "workplace_type": return <MultiCheck label="Workplace type" options={workplaceOptions} value={value.workplace_types_or ?? []} onChange={(next) => setField("workplace_types_or", next)} />
    case "employment_status": return <MultiCheck label="Employment status" options={employmentOptions} value={value.employment_statuses_or ?? []} onChange={(next) => setField("employment_statuses_or", next)} />
    case "seniority": return <MultiCheck label="Seniority" options={seniorityOptions} value={value.job_seniority_or ?? []} onChange={(next) => setField("job_seniority_or", next)} />
    case "easy_apply": return <TriStateField label="Application route" value={value.easy_apply} onChange={(next) => setField("easy_apply", next)} trueLabel="Easy apply only" falseLabel="Redirect applications only" />
    case "job_status": return <TriStateField label="Job status" value={value.is_closed} onChange={(next) => setField("is_closed", next)} trueLabel="Closed only" falseLabel="Open only" />
    case "closed_date": return <DatePair label="Closed date" from={value.closed_at_gte} to={value.closed_at_lte} onFrom={(next) => setField("closed_at_gte", next)} onTo={(next) => setField("closed_at_lte", next)} />
    case "source_domains": return <><TokenField label="Include domains" value={value.url_domain_or} onChange={(next) => setField("url_domain_or", next)} placeholder="greenhouse.io" /><TokenField label="Exclude domains" value={value.url_domain_not} onChange={(next) => setField("url_domain_not", next)} placeholder="linkedin.com" /></>
    case "required_data": return <><MultiCheck label="Require any of" options={propertyOptions} value={value.property_exists_or ?? []} onChange={(next) => setField("property_exists_or", next)} /><MultiCheck label="Require all of" options={propertyOptions} value={value.property_exists_and ?? []} onChange={(next) => setField("property_exists_and", next)} /></>
    case "job_ids": return <><NumericTokenField label="Include job IDs" value={value.job_id_or} onChange={(next) => setField("job_id_or", next)} /><NumericTokenField label="Exclude job IDs" value={value.job_id_not} onChange={(next) => setField("job_id_not", next)} /></>
    case "export_keys": return <TokenField label="Export batch keys" value={value.job_export_key_or} onChange={(next) => setField("job_export_key_or", next)} placeholder="Export key" />
    case "company_name": return <><TokenField label="Exact names" value={value.company_name_or} onChange={(next) => setField("company_name_or", next)} placeholder="Stripe" /><TokenField label="Exact, case-insensitive" value={value.company_name_case_insensitive_or} onChange={(next) => setField("company_name_case_insensitive_or", next)} placeholder="stripe" /><TokenField label="Exclude exact names" value={value.company_name_not} onChange={(next) => setField("company_name_not", next)} placeholder="Agency Inc" /><TokenField label="Name contains" value={value.company_name_partial_match_or} onChange={(next) => setField("company_name_partial_match_or", next)} placeholder="labs" /><TokenField label="Name must not contain" value={value.company_name_partial_match_not} onChange={(next) => setField("company_name_partial_match_not", next)} placeholder="staffing" /></>
    case "company_identifiers": return <><TokenField label="Company IDs" value={value.company_id_or} onChange={(next) => setField("company_id_or", next)} placeholder="Company ID" /><TokenField label="Exclude company IDs" value={value.company_id_not} onChange={(next) => setField("company_id_not", next)} placeholder="Company ID" /><TokenField label="LinkedIn URLs, slugs, or IDs" value={value.company_linkedin_url_or} onChange={(next) => setField("company_linkedin_url_or", next)} placeholder="linkedin.com/company/stripe" /></>
    case "company_domain": return <><TokenField label="Include domains" value={value.company_domain_or} onChange={(next) => setField("company_domain_or", next)} placeholder="stripe.com" /><TokenField label="Exclude domains" value={value.company_domain_not} onChange={(next) => setField("company_domain_not", next)} placeholder="agency.com" /></>
    case "company_description": return <><TokenField label="Include patterns" value={value.company_description_pattern_or} onChange={(next) => setField("company_description_pattern_or", next)} placeholder="developer tools" /><TokenField label="Exclude patterns" value={value.company_description_pattern_not} onChange={(next) => setField("company_description_pattern_not", next)} placeholder="outsourcing" /><TriStateField label="Accent-insensitive" value={value.company_description_pattern_accent_insensitive} onChange={(next) => setField("company_description_pattern_accent_insensitive", next)} /></>
    case "employee_count": return <EmployeeRange value={value} setFields={setFields} />
    case "revenue": return <NumberPair label="Annual revenue (USD)" min={value.min_revenue_usd} max={value.max_revenue_usd} onMin={(next) => setField("min_revenue_usd", next)} onMax={(next) => setField("max_revenue_usd", next)} currency />
    case "funding": return <><NumberPair label="Total funding (USD)" min={value.min_funding_usd} max={value.max_funding_usd} onMin={(next) => setField("min_funding_usd", next)} onMax={(next) => setField("max_funding_usd", next)} currency /><MultiCheck label="Funding stages" options={fundingStages} value={value.funding_stage_or ?? []} onChange={(next) => setField("funding_stage_or", next)} /><DatePair label="Last funding round" from={value.last_funding_round_date_gte} to={value.last_funding_round_date_lte} onFrom={(next) => setField("last_funding_round_date_gte", next)} onTo={(next) => setField("last_funding_round_date_lte", next)} /></>
    case "investors": return <><TokenField label="Exact investors" value={value.company_investors_or} onChange={(next) => setField("company_investors_or", next)} placeholder="Sequoia Capital" /><TokenField label="Investor name contains" value={value.company_investors_partial_match_or} onChange={(next) => setField("company_investors_partial_match_or", next)} placeholder="Andreessen" /></>
    case "company_tags": return <TokenField label="Company tags" value={value.company_tags_or} onChange={(next) => setField("company_tags_or", next)} placeholder="B2B" />
    case "company_type": return <SelectField label="Employer type" value={value.company_type ?? ""} onChange={(next) => setField("company_type", next as TheirStackJobSearchRequest["company_type"])} options={[["all", "All company types"], ["direct_employer", "Direct employers"], ["recruiting_agency", "Recruiting agencies"]]} />
    case "yc_company": return <TriStateField label="Y Combinator company" value={value.only_yc_companies} onChange={(next) => setField("only_yc_companies", next)} trueLabel="YC companies only" falseLabel="All companies" />
    case "hq_city": return <TokenField label="City contains" value={value.company_location_pattern_or} onChange={(next) => setField("company_location_pattern_or", next)} placeholder="San Francisco" />
    case "hq_country": { const excluded = keepUnknownCountry ? value.company_country_code_not_or_null : value.company_country_code_not; return <><CountryFields include={value.company_country_code_or} exclude={excluded} onInclude={(next) => setField("company_country_code_or", next)} onExclude={(next) => setFields(keepUnknownCountry ? { company_country_code_not_or_null: next, company_country_code_not: undefined } : { company_country_code_not: next, company_country_code_not_or_null: undefined })} /><CheckboxField label="Keep companies with unknown HQ country when excluding" checked={keepUnknownCountry} onChange={(checked) => { setKeepUnknownCountry(checked); setFields(checked ? { company_country_code_not_or_null: excluded, company_country_code_not: undefined } : { company_country_code_not: excluded, company_country_code_not_or_null: undefined }) }} /></> }
    case "company_lists": return <><NumericTokenField label="Include company list IDs" value={value.company_list_id_or} onChange={(next) => setField("company_list_id_or", next)} /><NumericTokenField label="Exclude company list IDs" value={value.company_list_id_not} onChange={(next) => setField("company_list_id_not", next)} /></>
    case "company_technologies": return <CatalogRelationField label="Technologies mentioned by company" search={searchTheirStackTechnologies} getLeading={technologyLeading} options={[["company_technology_slug_or", "Include any"], ["company_technology_slug_and", "Include all"], ["company_technology_slug_not", "Exclude any"]]} value={value} onChange={onChange} />
    case "company_keywords": return <CatalogRelationField label="Keywords mentioned by company" search={searchTheirStackKeywords} getLeading={keywordLeading} options={[["company_keyword_slug_or", "Include any"], ["company_keyword_slug_and", "Include all"], ["company_keyword_slug_not", "Exclude any"]]} value={value} onChange={onChange} />
  }
}

function CatalogRelationField({
  label,
  search,
  getLeading,
  options,
  value,
  onChange,
}: {
  label: string
  search: (query: string) => Promise<TheirStackTechnology[]>
  getLeading: (item: TheirStackTechnology) => ReactNode
  options: readonly (readonly [keyof TheirStackJobSearchRequest, string])[]
  value: TheirStackJobSearchRequest
  onChange: (value: TheirStackJobSearchRequest) => void
}) {
  const initialRelation = options.find(([key]) => hasFilterValue(value[key]))?.[0] ?? options[0][0]
  const initialSlugs = (value[initialRelation] as string[] | undefined) ?? []
  const [selected, setSelected] = useState<TheirStackTechnology[]>(() => initialSlugs.map(catalogPlaceholder))
  const [relation, setRelation] = useState<keyof TheirStackJobSearchRequest>(initialRelation)
  const summary = formatCatalogSummary(selected, technologyLabel)

  function commit(nextRelation: keyof TheirStackJobSearchRequest, items: TheirStackTechnology[]) {
    const copy = { ...value }
    options.forEach(([key]) => delete copy[key])
    if (items.length) Object.assign(copy, { [nextRelation]: items.map(technologyKey) })
    onChange(copy)
  }

  function updateItems(items: TheirStackTechnology[]) {
    setSelected(items)
    commit(relation, items)
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <NativeSelect
          className="w-full"
          value={String(relation)}
          onChange={(event) => {
            const next = event.target.value as keyof TheirStackJobSearchRequest
            setRelation(next)
            commit(next, selected)
          }}
        >
          {options.map(([key, optionLabel]) => <NativeSelectOption key={key} value={key}>{optionLabel}</NativeSelectOption>)}
        </NativeSelect>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-between font-normal">
              <span className={cn("truncate", !summary && "text-muted-foreground")}>{summary || "Choose from catalog…"}</span>
              <ChevronDown />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(29rem,calc(100vw-2rem))]">
            <CatalogPicker
              selected={selected}
              onChange={updateItems}
              search={search}
              getKey={technologyKey}
              getLabel={technologyLabel}
              getScope={technologyScope}
              getLeading={getLeading}
              icon={<Search className="size-4" />}
              title={label}
              relation={options.find(([key]) => key === relation)?.[1].toLowerCase() ?? "matches"}
              description="Search the live TheirStack catalog and select one or more values."
              placeholder="Search catalog…"
              addPlaceholder="Add another…"
              clearSearchLabel="Clear catalog search"
              emptyLabel="No matching catalog entries found."
              noun="value"
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

function catalogPlaceholder(slug: string): TheirStackTechnology {
  return {
    companies: 0,
    companiesFoundLastWeek: 0,
    jobs: 0,
    name: slug,
    slug,
    type: "catalog",
  }
}

function TokenField({ label, value = [], onChange, placeholder }: { label: string; value?: string[]; onChange: (value: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("")
  function commit(raw = draft) {
    const additions = splitFilterTerms(raw)
    if (additions.length) onChange([...new Set([...value, ...additions])])
    setDraft("")
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") { event.preventDefault(); commit() }
    if (event.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1))
  }
  return <div className="space-y-1.5"><Label>{label}</Label><div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border bg-background p-1.5 focus-within:ring-3 focus-within:ring-ring/30">{value.map((item) => <Badge key={item} variant="secondary" className="gap-1 font-normal">{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => onChange(value.filter((entry) => entry !== item))}><X className="size-3" /></button></Badge>)}<input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} onBlur={() => commit()} onPaste={(event) => { const text = event.clipboardData.getData("text"); if (/[,\n]/.test(text)) { event.preventDefault(); commit(text) } }} placeholder={value.length ? "Add another…" : placeholder} className="h-6 min-w-36 flex-1 bg-transparent px-1 text-sm outline-none" /></div><p className="text-[11px] text-muted-foreground">Press Enter or comma to add each value.</p></div>
}

function NumericTokenField({ label, value = [], onChange }: { label: string; value?: number[]; onChange: (value: number[]) => void }) {
  return <TokenField label={label} value={value.map(String)} onChange={(next) => onChange(next.map(Number).filter(Number.isSafeInteger))} placeholder="12345" />
}

function NumberPair({ label, minLabel = "Minimum", maxLabel = "Maximum", min, max, onMin, onMax, currency = false }: { label: string; minLabel?: string; maxLabel?: string; min?: number; max?: number; onMin: (value?: number) => void; onMax: (value?: number) => void; currency?: boolean }) {
  return <div className="space-y-1.5"><Label>{label}</Label><div className="grid grid-cols-2 gap-2"><NumberInput label={minLabel} value={min} onChange={onMin} currency={currency} /><NumberInput label={maxLabel} value={max} onChange={onMax} currency={currency} /></div></div>
}

function NumberInput({ label, value, onChange, currency }: { label: string; value?: number; onChange: (value?: number) => void; currency: boolean }) {
  return <div className="relative">{currency ? <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span> : null}<Input aria-label={label} type="number" min={0} step={1} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} placeholder={label} className={currency ? "pl-7" : undefined} /></div>
}

function DatePair({ label, from, to, onFrom, onTo }: { label: string; from?: string; to?: string; onFrom: (value?: string) => void; onTo: (value?: string) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><div className="grid grid-cols-2 gap-2"><Input aria-label={`${label} from`} type="date" value={from ?? ""} onChange={(event) => onFrom(event.target.value || undefined)} /><Input aria-label={`${label} to`} type="date" value={to ?? ""} onChange={(event) => onTo(event.target.value || undefined)} /></div></div>
}

function MultiCheck<Value extends string>({ label, options, value, onChange }: { label: string; options: readonly (readonly [Value, string])[]; value: Value[]; onChange: (value: Value[]) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">{options.map(([id, optionLabel]) => <CheckboxField key={id} label={optionLabel} checked={value.includes(id)} onChange={(checked) => onChange(checked ? [...value, id] : value.filter((item) => item !== id))} />)}</div></div>
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox aria-label={label} checked={checked} onCheckedChange={(next) => onChange(next === true)} />{label}</label>
}

function TriStateField({ label, value, onChange, trueLabel = "Yes", falseLabel = "No" }: { label: string; value?: boolean; onChange: (value?: boolean) => void; trueLabel?: string; falseLabel?: string }) {
  return <SelectField label={label} value={value === undefined ? "" : String(value)} onChange={(next) => onChange(next === "" ? undefined : next === "true")} options={[["true", trueLabel], ["false", falseLabel]]} />
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) {
  return <div className="space-y-1.5"><Label>{label}</Label><NativeSelect className="w-full" value={value} onChange={(event) => onChange(event.target.value)}><NativeSelectOption value="">Any</NativeSelectOption>{options.map(([id, optionLabel]) => <NativeSelectOption key={id} value={id}>{optionLabel}</NativeSelectOption>)}</NativeSelect></div>
}

function AdvancedPatternFields({ prefix, value, setField }: { prefix: "job_title_pattern" | "job_description_pattern"; value: TheirStackJobSearchRequest; setField: <K extends keyof TheirStackJobSearchRequest>(key: K, value: TheirStackJobSearchRequest[K] | undefined) => void }) {
  const orKey = `${prefix}_or` as "job_title_pattern_or" | "job_description_pattern_or"
  const andKey = `${prefix}_and` as "job_title_pattern_and" | "job_description_pattern_and"
  const notKey = `${prefix}_not` as "job_title_pattern_not" | "job_description_pattern_not"
  return <details><summary className="cursor-pointer text-xs font-medium text-muted-foreground">Advanced regex patterns</summary><div className="mt-3 space-y-3"><TokenField label="Match any pattern" value={value[orKey]} onChange={(next) => setField(orKey, next)} placeholder="(?i)\\bplatform\\b" /><TokenField label="Match every pattern" value={value[andKey]} onChange={(next) => setField(andKey, next)} placeholder="\\bengineer\\b" /><TokenField label="Exclude patterns" value={value[notKey]} onChange={(next) => setField(notKey, next)} placeholder="\\bmanager\\b" /></div></details>
}

function CountryFields({ include, exclude, onInclude, onExclude }: { include?: string[]; exclude?: string[]; onInclude: (value: string[]) => void; onExclude: (value: string[]) => void }) {
  return <><CountryPicker label="Include countries" value={include ?? []} onChange={onInclude} /><CountryPicker label="Exclude countries" value={exclude ?? []} onChange={onExclude} /></>
}

function CountryPicker({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const names = useMemo(() => new Intl.DisplayNames([navigator.language], { type: "region" }), [])
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return isoCountryCodes
      .filter((code) => !value.includes(code))
      .map((code) => ({ code, name: names.of(code) ?? code }))
      .filter(({ code, name }) => !needle || code.toLowerCase().includes(needle) || name.toLocaleLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40)
  }, [names, query, value])
  return <div className="space-y-1.5"><Label>{label}</Label><Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery("") }}><PopoverTrigger asChild><Button variant="outline" className="w-full justify-between font-normal"><span className="text-muted-foreground">Search countries…</span><ChevronDown /></Button></PopoverTrigger><PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-2"><div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a country or ISO code…" className="pl-8" autoFocus /></div><ScrollArea className="mt-2 h-56"><div className="space-y-0.5 pr-2">{results.map(({ code, name }) => <button key={code} type="button" className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left hover:bg-muted" onClick={() => { onChange([...value, code]); setOpen(false) }}><span>{name}</span><span className="text-xs text-muted-foreground">{code}</span></button>)}{results.length === 0 ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matching countries.</p> : null}</div></ScrollArea></PopoverContent></Popover><div className="flex flex-wrap gap-1.5">{value.map((code) => <Badge key={code} variant="secondary" className="gap-1 font-normal">{names.of(code) ?? code}<button type="button" aria-label={`Remove ${code}`} onClick={() => onChange(value.filter((item) => item !== code))}><X className="size-3" /></button></Badge>)}</div></div>
}

function EmployeeRange({ value, setFields }: { value: TheirStackJobSearchRequest; setFields: (patch: Partial<TheirStackJobSearchRequest>) => void }) {
  const includeUnknown = value.min_employee_count_or_null !== undefined || value.max_employee_count_or_null !== undefined
  const min = includeUnknown ? value.min_employee_count_or_null : value.min_employee_count
  const max = includeUnknown ? value.max_employee_count_or_null : value.max_employee_count
  function setRange(side: "min" | "max", next?: number) {
    const regular = `${side}_employee_count` as "min_employee_count" | "max_employee_count"
    const unknown = `${side}_employee_count_or_null` as "min_employee_count_or_null" | "max_employee_count_or_null"
    setFields({ [includeUnknown ? unknown : regular]: next })
  }
  return <div className="space-y-2"><NumberPair label="Employee count" min={min} max={max} onMin={(next) => setRange("min", next)} onMax={(next) => setRange("max", next)} /><CheckboxField label="Also include companies with unknown employee count" checked={includeUnknown} onChange={(checked) => setFields({ min_employee_count: checked ? undefined : min, max_employee_count: checked ? undefined : max, min_employee_count_or_null: checked ? min : undefined, max_employee_count_or_null: checked ? max : undefined })} /></div>
}

function FilterOption({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-muted",
        selected && "bg-muted",
      )}
      onClick={onClick}
    >
      <span className="flex size-4 items-center justify-center">
        {selected ? <Check className="size-4" /> : null}
      </span>
      {children}
    </button>
  )
}

type SearchPhase = "idle" | "expanding" | "searching"

type JobSearchPipelineResult = {
  filters: TheirStackJobSearchRequest
  result: Awaited<ReturnType<typeof searchTheirStackJobs>>
  expansion: TheirStackSearchQueryExpansion | null
}

async function runJobSearchPipeline(
  filters: TheirStackJobSearchRequest,
  query: { jobTitle: string; description: string },
  preSearchModel: string,
  preSearchReasoning: CodexReasoningLevel,
  onPhase: (phase: Exclude<SearchPhase, "idle">) => void,
): Promise<JobSearchPipelineResult> {
  const jobTitle = query.jobTitle.trim()
  const description = query.description.trim()
  let processed = filters
  let expansion: TheirStackSearchQueryExpansion | null = null

  if (jobTitle || description) {
    onPhase("expanding")
    expansion = await expandTheirStackSearchQuery({
      jobTitle: jobTitle || undefined,
      description: description || undefined,
    }, { model: preSearchModel, reasoningEffort: preSearchReasoning })
    processed = applySearchQueryExpansion(processed, expansion)
  }

  onPhase("searching")
  return {
    filters: processed,
    result: await searchTheirStackJobs(processed),
    expansion,
  }
}

function applySearchQueryExpansion(
  filters: TheirStackJobSearchRequest,
  expansion: TheirStackSearchQueryExpansion,
) {
  const processed = { ...filters }
  if (expansion.titlePatterns.length) {
    processed.job_title_pattern_or = uniqueValues([
      ...(processed.job_title_pattern_or ?? []),
      ...expansion.titlePatterns,
    ])
    delete processed.job_title_or
  }
  if (expansion.descriptionPatterns.length) {
    processed.job_description_pattern_or = uniqueValues([
      ...(processed.job_description_pattern_or ?? []),
      ...expansion.descriptionPatterns,
    ])
    delete processed.job_description_contains_or
  }
  return compactRequest(processed)
}

function uniqueValues(values: string[]) {
  return [...new Set(values)]
}

function SearchExpansionNotice({ expansion }: { expansion: TheirStackSearchQueryExpansion }) {
  const fields = [
    ["Job title", expansion.titlePatterns],
    ["Description", expansion.descriptionPatterns],
  ] as const
  const populatedFields = fields.filter(([, patterns]) => patterns.length)

  return (
    <div className="rounded-lg border bg-background px-4 py-3 text-sm">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-medium">Codex widened this search</p>
          <p className="mt-0.5 text-muted-foreground">
            TheirStack is searching regex variants for {populatedFields.map(([label]) => label.toLowerCase()).join(" and ")}.
          </p>
        </div>
      </div>
      <details className="mt-2 border-t pt-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          View regex sent to TheirStack
        </summary>
        <div className="mt-2 space-y-2">
          {populatedFields.map(([label, patterns]) => (
            <div key={label}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
              <div className="space-y-1">
                {patterns.map((pattern) => (
                  <code key={pattern} className="block overflow-x-auto rounded bg-muted px-2 py-1 text-xs">
                    {pattern}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

type JobColumnId =
  | "jobTitle"
  | "company"
  | "postedAt"
  | "jobUrl"
  | "discoveredAt"
  | "closedAt"
  | "matchingPhrases"
  | "jobCountry"
  | "remote"
  | "jobLocations"
  | "salary"
  | "hiringManager"
  | "reportsTo"
  | "employmentStatuses"

const jobColumnDefinitions: { id: JobColumnId; label: string; defaultVisible: boolean }[] = [
  { id: "jobTitle", label: "Job Title", defaultVisible: true },
  { id: "company", label: "Company", defaultVisible: true },
  { id: "postedAt", label: "Posted At", defaultVisible: true },
  { id: "jobUrl", label: "Job URL", defaultVisible: true },
  { id: "discoveredAt", label: "Discovered At", defaultVisible: false },
  { id: "closedAt", label: "Closed At", defaultVisible: false },
  { id: "matchingPhrases", label: "Matching Phrases", defaultVisible: false },
  { id: "jobCountry", label: "Job Country", defaultVisible: true },
  { id: "remote", label: "Remote", defaultVisible: true },
  { id: "jobLocations", label: "Job Locations", defaultVisible: true },
  { id: "salary", label: "Salary", defaultVisible: true },
  { id: "hiringManager", label: "Hiring Manager", defaultVisible: true },
  { id: "reportsTo", label: "Reports To", defaultVisible: false },
  { id: "employmentStatuses", label: "Employment Statuses", defaultVisible: false },
]

function JobResultsTable({
  jobs,
  revealingJobIds,
  onSelect,
  page,
  pageSize,
  totalResults,
  hasMoreResults,
  paginationDisabled,
  onPageChange,
}: {
  jobs: TheirStackJob[]
  revealingJobIds: number[]
  onSelect: (job: TheirStackJob) => void
  page: number
  pageSize: number
  totalResults: number | null
  hasMoreResults: boolean
  paginationDisabled: boolean
  onPageChange: (page: number) => void
}) {
  const [visibleColumns, setVisibleColumns] = useState<Record<JobColumnId, boolean>>(() =>
    Object.fromEntries(jobColumnDefinitions.map((column) => [column.id, column.defaultVisible])) as Record<JobColumnId, boolean>,
  )
  const [selectedJobIds, setSelectedJobIds] = useState<number[]>([])
  const allSelected = jobs.length > 0 && jobs.every((job) => selectedJobIds.includes(job.id))
  const someSelected = jobs.some((job) => selectedJobIds.includes(job.id))
  const normalizedPageSize = pageSize > 0 ? pageSize : THEIRSTACK_JOB_PAGE_SIZE
  const totalPages = totalResults === null
    ? null
    : Math.max(1, Math.ceil(totalResults / normalizedPageSize))
  const canGoPrevious = page > 0
  const canGoNext = totalPages === null ? hasMoreResults : page < totalPages - 1
  const showPagination = canGoPrevious || canGoNext || (totalPages !== null && totalPages > 1)
  const firstResult = page * normalizedPageSize + 1
  const lastResult = page * normalizedPageSize + jobs.length

  function toggleAll(checked: boolean) {
    setSelectedJobIds(checked ? jobs.map((job) => job.id) : [])
  }

  function toggleJob(jobId: number, checked: boolean) {
    setSelectedJobIds((current) => checked ? [...new Set([...current, jobId])] : current.filter((id) => id !== jobId))
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-background">
      <div className="flex min-h-12 items-center justify-between border-b bg-muted/20 px-3">
        <p className="text-sm text-muted-foreground">
          {totalResults !== null
            ? `Showing ${firstResult.toLocaleString()}–${lastResult.toLocaleString()} of ${totalResults.toLocaleString()} jobs`
            : `${jobs.length} blurred ${jobs.length === 1 ? "job" : "jobs"}`}
          {selectedJobIds.length ? ` · ${selectedJobIds.length} selected` : ""}
        </p>
        <ColumnManager visibleColumns={visibleColumns} onChange={setVisibleColumns} />
      </div>
      <Table className="min-w-max">
        <TableHeader className="bg-muted/45">
          <TableRow className="hover:bg-transparent">
            {visibleColumns.jobTitle ? (
              <TableHead className="min-w-72">
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    aria-label="Select all jobs"
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                  />
                  Job Title
                </div>
              </TableHead>
            ) : null}
            <TableHead className="w-28">Reveal</TableHead>
            {jobColumnDefinitions.filter((column) => column.id !== "jobTitle" && visibleColumns[column.id]).map((column) => (
              <TableHead key={column.id}>{column.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id} data-state={selectedJobIds.includes(job.id) ? "selected" : undefined}>
              {visibleColumns.jobTitle ? (
                <TableCell className="max-w-80 whitespace-normal font-medium">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      aria-label={`Select ${job.jobTitle}`}
                      checked={selectedJobIds.includes(job.id)}
                      onCheckedChange={(checked) => toggleJob(job.id, checked === true)}
                    />
                    <span>{job.jobTitle}</span>
                  </div>
                </TableCell>
              ) : null}
              <TableCell>
                <Button
                  size="sm"
                  variant={job.hasBlurredData ? "secondary" : "outline"}
                  className={cn("h-8", job.hasBlurredData && "bg-primary/12 text-foreground hover:bg-primary/20")}
                  disabled={(job.hasBlurredData && !job.datePosted) || revealingJobIds.includes(job.id)}
                  onClick={() => onSelect(job)}
                >
                  {revealingJobIds.includes(job.id) ? <LoaderCircle className="animate-spin" /> : <Eye />}
                  {revealingJobIds.includes(job.id) ? "Revealing…" : job.hasBlurredData ? "Reveal" : "View"}
                </Button>
              </TableCell>
              {jobColumnDefinitions.filter((column) => column.id !== "jobTitle" && visibleColumns[column.id]).map((column) => (
                <TableCell key={column.id} className="max-w-80 whitespace-normal">
                  <JobColumnValue job={job} column={column.id} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {showPagination ? (
        <div className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Page {(page + 1).toLocaleString()}{totalPages !== null ? ` of ${totalPages.toLocaleString()}` : ""}
          </p>
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  aria-disabled={!canGoPrevious || paginationDisabled}
                  className={cn((!canGoPrevious || paginationDisabled) && "pointer-events-none opacity-50")}
                  onClick={(event) => {
                    event.preventDefault()
                    if (canGoPrevious && !paginationDisabled) onPageChange(page - 1)
                  }}
                />
              </PaginationItem>
              {totalPages !== null ? paginationPageItems(page, totalPages).map((item) => (
                <PaginationItem key={typeof item === "number" ? item : item}>
                  {typeof item === "number" ? (
                    <PaginationLink
                      href="#"
                      isActive={item === page}
                      aria-label={`Go to page ${item + 1}`}
                      onClick={(event) => {
                        event.preventDefault()
                        if (item !== page && !paginationDisabled) onPageChange(item)
                      }}
                      className={cn(paginationDisabled && "pointer-events-none opacity-50")}
                    >
                      {item + 1}
                    </PaginationLink>
                  ) : (
                    <PaginationEllipsis />
                  )}
                </PaginationItem>
              )) : (
                <PaginationItem>
                  <span className="flex h-8 items-center px-2 text-sm font-medium">{page + 1}</span>
                </PaginationItem>
              )}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  aria-disabled={!canGoNext || paginationDisabled}
                  className={cn((!canGoNext || paginationDisabled) && "pointer-events-none opacity-50")}
                  onClick={(event) => {
                    event.preventDefault()
                    if (canGoNext && !paginationDisabled) onPageChange(page + 1)
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      ) : null}
    </section>
  )
}

type PaginationPageItem = number | "ellipsis-before" | "ellipsis-after"

function paginationPageItems(page: number, totalPages: number): PaginationPageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index)

  const start = Math.max(1, Math.min(page - 1, totalPages - 4))
  const end = Math.min(totalPages - 2, start + 2)
  const items: PaginationPageItem[] = [0]
  if (start > 1) items.push("ellipsis-before")
  for (let index = start; index <= end; index += 1) items.push(index)
  if (end < totalPages - 2) items.push("ellipsis-after")
  items.push(totalPages - 1)
  return items
}

function ColumnManager({
  visibleColumns,
  onChange,
}: {
  visibleColumns: Record<JobColumnId, boolean>
  onChange: (columns: Record<JobColumnId, boolean>) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm"><Columns3 /> Columns</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <PopoverHeader className="border-b px-4 py-3">
          <PopoverTitle>Columns</PopoverTitle>
          <PopoverDescription>Choose the fields shown in the results table.</PopoverDescription>
        </PopoverHeader>
        <ScrollArea className="h-96">
          <div className="space-y-1 p-3">
            {jobColumnDefinitions.map((column) => (
              <label key={column.id} className="flex cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <span>{column.label}</span>
                <Switch
                  checked={visibleColumns[column.id]}
                  onCheckedChange={(checked) => onChange({ ...visibleColumns, [column.id]: checked })}
                  aria-label={`Show ${column.label}`}
                />
              </label>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

function JobColumnValue({ job, column }: { job: TheirStackJob; column: JobColumnId }) {
  switch (column) {
    case "jobTitle":
      return job.jobTitle
    case "company":
      return <span className={cn(job.hasBlurredData && "select-none blur-[5px]")}>{job.company || "Not available"}</span>
    case "postedAt":
      return formatJobDate(job.datePosted)
    case "jobUrl": {
      const url = job.finalUrl || job.url || job.sourceUrl
      return url && !job.hasBlurredData ? (
        <button type="button" onClick={() => void openUrl(url)} className="inline-flex items-center gap-1 text-primary hover:underline">
          Open <ExternalLink className="size-3.5" />
        </button>
      ) : <span className={cn("text-muted-foreground", job.hasBlurredData && "select-none blur-[3px]")}>Unavailable</span>
    }
    case "discoveredAt":
      return formatJobDate(job.discoveredAt)
    case "closedAt":
      return formatJobDate(job.closedAt)
    case "matchingPhrases":
      return joinValues(job.matchingPhrases)
    case "jobCountry":
      return <span>{countryFlag(job.countryCode)} {job.country || job.countryCode || "Not available"}</span>
    case "remote":
      return job.remote ? "Yes" : job.hybrid ? "Hybrid" : "No"
    case "jobLocations":
      return job.locations.map((location) => location.displayName || location.name).filter(Boolean).join(", ") || job.longLocation || job.shortLocation || job.location || "Not available"
    case "salary":
      return formatSalary(job)
    case "hiringManager":
      return joinValues(job.hiringTeam.map((member) => member.fullName || member.role || ""))
    case "reportsTo":
      return joinValues(job.managerRoles)
    case "employmentStatuses":
      return joinValues(job.employmentStatuses.map(titleFromSlug))
  }
}

function JobDetailDialog({
  job,
  onClose,
}: {
  job: TheirStackJob | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const jobUrl = job ? (job.finalUrl || job.url || job.sourceUrl) : null

  useEffect(() => setCopied(false), [job?.id])

  async function copyDescription() {
    if (!job?.description || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(job.description)
    setCopied(true)
  }

  if (!job) return null

  const location = job.locations
    .map((candidate) => candidate.displayName || candidate.name)
    .filter(Boolean)
    .join(", ") || job.longLocation || job.shortLocation || job.location || job.country || "Location not provided"
  const technologies = job.technologySlugs.map(titleFromSlug)
  const technologySet = new Set(job.technologySlugs)
  const intents = job.keywordSlugs.filter((slug) => !technologySet.has(slug)).map(titleFromSlug)
  const employment = job.employmentStatuses.map(titleFromSlug).join(", ")

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton
        className="job-detail-dialog grid max-h-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-xl p-0 shadow-2xl"
      >
        <header className="border-b bg-background px-5 py-5 pr-14 md:px-7 md:py-6 md:pr-16">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-sm font-semibold text-muted-foreground">
              {job.companyObject?.logo ? (
                <img src={job.companyObject.logo} alt="" className="size-full object-contain p-1.5" />
              ) : (
                (job.company || job.jobTitle).trim().charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
                {job.jobTitle}
              </DialogTitle>
              <DialogDescription className="mt-1.5 flex items-center gap-1.5 text-base text-foreground/70">
                <Building2 className="size-4" />
                <span className="truncate">{job.company || "Company not provided"}</span>
              </DialogDescription>
            </div>
            {jobUrl ? (
              <div className="mr-7 hidden shrink-0 items-center gap-2 sm:flex">
                <Button variant="outline" size="icon-lg" title="Copy job link" aria-label="Copy job link" onClick={() => void navigator.clipboard.writeText(jobUrl)}>
                  <Link2 />
                </Button>
                <Button variant="outline" size="icon-lg" title="Open original job" aria-label="Open original job" onClick={() => void openUrl(jobUrl)}>
                  <ExternalLink />
                </Button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <JobMetaPill icon={<CalendarDays />} label={formatPostedLabel(job.datePosted)} />
            <JobMetaPill icon={<MapPin />} label={location} />
            <JobMetaPill icon={<BadgeDollarSign />} label={formatSalary(job)} />
            {employment ? <JobMetaPill icon={<BriefcaseBusiness />} label={employment} /> : null}
            {job.seniority ? <JobMetaPill icon={<UserRound />} label={titleFromSlug(job.seniority)} /> : null}
            {job.remote || job.hybrid ? <JobMetaPill icon={<Laptop />} label={job.remote ? "Remote" : "Hybrid"} /> : null}
            {job.easyApply != null ? <JobMetaPill icon={<Sparkles />} label={job.easyApply ? "Easy apply" : "External apply"} /> : null}
            {jobUrl ? <JobMetaPill icon={<Link2 />} label={sourceDomain(jobUrl)} /> : null}
            {job.discoveredAt ? <JobMetaPill icon={<Globe2 />} label={formatDiscoveredLabel(job.discoveredAt)} /> : null}
          </div>
        </header>

        <div className="min-h-0 overflow-y-auto bg-background">
          <JobTagSection title="Technologies mentioned" values={technologies} />
          <JobTagSection title="Intents mentioned" values={intents} />

          <section className="border-t px-5 py-6 md:px-7 md:py-7">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.04em] text-muted-foreground">Description</h2>
              {job.description ? (
                <Button variant="outline" className="h-9" onClick={() => void copyDescription()}>
                  <Copy />
                  {copied ? "Copied" : "Copy to clipboard"}
                </Button>
              ) : null}
            </div>
            {job.description ? (
              <JobDescription value={job.description} />
            ) : (
              <p className="text-sm text-muted-foreground">No job description was provided.</p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function JobMetaPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-lg bg-muted px-2.5 text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0">
      {icon}
      <span className="truncate">{label}</span>
    </span>
  )
}

function JobTagSection({ title, values }: { title: string; values: string[] }) {
  return (
    <section className="border-t px-5 py-6 first:border-t-0 md:px-7">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.04em] text-muted-foreground">{title}</h2>
      {values.length ? (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => <Badge key={value} variant="secondary" className="h-8 rounded-lg px-3 font-normal">{value}</Badge>)}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">None identified</p>
      )}
    </section>
  )
}

function JobDescription({ value }: { value: string }) {
  return (
    <div className="max-w-none whitespace-pre-wrap text-[0.96rem] leading-7 text-foreground/90">
      {value}
    </div>
  )
}

function formatPostedLabel(value?: string | null) {
  if (!value) return "Posted date not provided"
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return `Posted ${value}`
  const today = startOfLocalDay(new Date())
  const posted = startOfLocalDay(date)
  const days = Math.round((today.getTime() - posted.getTime()) / 86_400_000)
  if (days === 0) return "Posted today"
  if (days === 1) return "Posted yesterday"
  if (days > 1 && days < 31) return `Posted ${days} days ago`
  return `Posted ${format(date, "MMM d, yyyy")}`
}

function formatDiscoveredLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return `Discovered ${value}`
  const hours = Math.max(0, Math.floor((Date.now() - date.getTime()) / 3_600_000))
  if (hours < 1) return "Discovered recently"
  if (hours < 24) return `Discovered ${hours} ${hours === 1 ? "hour" : "hours"} ago`
  const days = Math.floor(hours / 24)
  if (days < 31) return `Discovered ${days} ${days === 1 ? "day" : "days"} ago`
  return `Discovered ${format(date, "MMM d, yyyy")}`
}

function sourceDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "")
  } catch {
    return "Job source"
  }
}

function JobTableLoading() {
  return (
    <div className="overflow-hidden rounded-lg border bg-background" aria-label="Loading jobs">
      <div className="h-12 animate-pulse border-b bg-muted/40" />
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex h-16 items-center gap-8 border-b px-4 last:border-0">
          <div className="h-4 w-56 animate-pulse rounded bg-muted" />
          <div className="h-8 w-20 animate-pulse rounded bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

function formatJobDate(value?: string | null) {
  if (!value) return "Not available"
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : format(date, "MMM d, yyyy")
}

function formatSalary(job: TheirStackJob) {
  if (job.salaryString) return job.salaryString
  if (job.minAnnualSalaryUsd != null && job.maxAnnualSalaryUsd != null) {
    return `${formatUsd(job.minAnnualSalaryUsd)} – ${formatUsd(job.maxAnnualSalaryUsd)}`
  }
  if (job.avgAnnualSalaryUsd != null) return `${formatUsd(job.avgAnnualSalaryUsd)} average`
  return "Not available"
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
}

function joinValues(values: string[]) {
  return values.filter(Boolean).join(", ") || "Not available"
}

function countryFlag(countryCode?: string | null) {
  if (!countryCode || countryCode.length !== 2) return ""
  return String.fromCodePoint(...countryCode.toUpperCase().split("").map((letter) => 127397 + letter.charCodeAt(0)))
}

function errorMessage(cause: unknown, fallback: string) {
  if (typeof cause === "string") return cause
  if (cause instanceof Error && cause.message) return cause.message
  return fallback
}
