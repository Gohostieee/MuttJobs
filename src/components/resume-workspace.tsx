import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react"
import { open, save } from "@tauri-apps/plugin-dialog"
import { openPath } from "@tauri-apps/plugin-opener"
import {
  ArrowLeft,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  ChevronDown,
  ChevronRight,
  Columns3,
  Eye,
  EyeOff,
  FileUp,
  FileJson2,
  FileDown,
  FolderOpen,
  Folder,
  Grid2X2,
  GripVertical,
  ListTree,
  LoaderCircle,
  Maximize2,
  Minus,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react"

import {
  getResumePageWidth,
  getResumeSectionEntries,
  reorderResumeSections,
  ResumeDocument,
  type ResumeChangeMeta,
  type ResumeSectionDropPosition,
} from "@/components/resume-document"
import { ResumeDesignPanel } from "@/components/resume-design-panel"
import { ResumeSkillsSection } from "@/components/resume-skills-section"
import {
  AgentActivityTrace,
  DEFAULT_RESUME_AI_SELECTION,
  ModelReasoningSelector,
  ResumeAiSidebar,
  type AgentActivity,
} from "@/components/resume-ai-sidebar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { createResume, getResumesDirectory, loadResumes, saveResume } from "@/lib/resume-storage"
import { exportResumePdf } from "@/lib/resume-export"
import {
  listResumeImportJobs,
  startResumePdfImport,
  subscribeToResumeImportEvents,
  type ResumeImportJob,
} from "@/lib/resume-import"
import { ALL_AGENT_MODELS } from "@/lib/agent-models"
import {
  addResumeSection,
  addResumeSectionItem,
  getResumeSectionOptions,
  getResumeSectionItemEntries,
  MAX_RESUME_SECTION_COLUMNS,
  reorderResumeSectionItems,
  setResumeSectionPageAlignment,
  setResumeSectionColumns,
  setResumeSectionItemHidden,
  setResumeSectionTextAlignment,
  removeResumeSection,
  removeResumeSectionItem,
  setResumeSectionHidden,
} from "@/lib/resume-sections"
import type { ResumeSectionItemDropPosition, ResumeSectionLane } from "@/lib/resume-sections"
import type { ResumeFile, ResumeSectionAlignment } from "@/lib/resume-types"
import type {
  ResumeSelectionAction,
  ResumeTextSelection,
} from "@/lib/resume-selection"

const MIN_ZOOM = 0.1
const DEFAULT_AI_SIDEBAR_WIDTH = 336
const MIN_AI_SIDEBAR_WIDTH = 368
const MAX_AI_SIDEBAR_WIDTH = 520
const DEFAULT_SECTIONS_SIDEBAR_WIDTH = 288
const MIN_SECTIONS_SIDEBAR_WIDTH = 240
const MAX_SECTIONS_SIDEBAR_WIDTH = 520

const RESUME_SECTION_ALIGNMENT_OPTIONS = [
  { value: "left", label: "Left", icon: AlignLeft },
  { value: "center", label: "Centered", icon: AlignCenter },
  { value: "right", label: "Right", icon: AlignRight },
] as const satisfies ReadonlyArray<{ value: ResumeSectionAlignment; label: string; icon: typeof AlignLeft }>

type ResumeTextEdit = {
  key: string
  before: ResumeFile["data"]
  redoBefore: ResumeFile["data"][]
  changed: boolean
}

type ResumeSaveMode = "debounced" | "immediate"

type ResumeSelectionActionRequest = {
  id: number
  action: ResumeSelectionAction
  selection: ResumeTextSelection
}

type ResumeCreationMode = "blank" | "pdf"

export function ResumeWorkspace({ onViewerChange }: { onViewerChange?: (open: boolean) => void }) {
  const [resumes, setResumes] = useState<ResumeFile[]>([])
  const [selected, setSelected] = useState<ResumeFile | null>(null)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [resumeCreationMode, setResumeCreationMode] = useState<ResumeCreationMode>("blank")
  const [resumeName, setResumeName] = useState("")
  const [resumePdfPath, setResumePdfPath] = useState("")
  const [resumeImportSelection, setResumeImportSelection] = useState(DEFAULT_RESUME_AI_SELECTION)
  const [resumeImports, setResumeImports] = useState<ResumeImportJob[]>([])
  const [createError, setCreateError] = useState("")
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [loadedResumes, loadedImports] = await Promise.all([
        loadResumes(),
        listResumeImportJobs(),
      ])
      setResumes(loadedResumes)
      setResumeImports(loadedImports)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load resumes.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined

    void subscribeToResumeImportEvents((job) => {
      if (disposed) return
      if (job.status === "completed") {
        setResumeImports((current) => current.filter((existing) => existing.jobId !== job.jobId))
        void refresh()
        return
      }
      setResumeImports((current) => upsertResumeImport(current, job))
    }).then((unlisten) => {
      if (disposed) unlisten()
      else cleanup = unlisten
    }).catch(() => {
      // The browser preview has no Tauri event bridge.
    })

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [refresh])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return resumes
    return resumes.filter((resume) => [resume.data.basics?.name, resume.data.basics?.headline, resume.fileName]
      .some((value) => value?.toLowerCase().includes(needle)))
  }, [query, resumes])

  const filteredImports = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return resumeImports
    return resumeImports.filter((job) => [job.pdfFileName, job.resumeName, job.stage]
      .some((value) => value?.toLowerCase().includes(needle)))
  }, [query, resumeImports])

  async function openFolder() {
    const directory = await getResumesDirectory()
    if (directory) await openPath(directory)
  }

  function openCreateDialog() {
    setResumeCreationMode("blank")
    setResumeName("")
    setResumePdfPath("")
    setCreateError("")
    setCreateDialogOpen(true)
  }

  async function chooseResumePdf() {
    setCreateError("")
    try {
      const selectedPath = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "PDF resume", extensions: ["pdf"] }],
      })
      if (typeof selectedPath === "string") setResumePdfPath(selectedPath)
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : "Could not choose a PDF.")
    }
  }

  async function createSelectedResume() {
    if (creating) return

    const name = resumeName.trim()
    if (resumeCreationMode === "blank" && !name) return
    if (resumeCreationMode === "pdf" && !resumePdfPath) {
      setCreateError("Choose a PDF resume to import first.")
      return
    }

    setCreating(true)
    setCreateError("")
    try {
      if (resumeCreationMode === "pdf") {
        const job = await startResumePdfImport(
          resumePdfPath,
          name || undefined,
          resumeImportSelection,
        )
        setResumeImports((current) => upsertResumeImport(current, job))
      } else {
        const resume = await createResume(name)
        setResumes((current) => [resume, ...current])
      }
      setCreateDialogOpen(false)
      setResumeName("")
      setResumePdfPath("")
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : "Could not create resume.")
    } finally {
      setCreating(false)
    }
  }

  if (selected) {
    return (
      <ResumeViewer
        file={selected}
        onBack={(updatedFile) => {
          setResumes((current) => current.map((resume) => resume.id === selected.id ? updatedFile : resume))
          onViewerChange?.(false)
          setSelected(null)
        }}
      />
    )
  }

  return (
    <main className="resume-workspace">
      <header className="resume-library-header">
        <div>
          <div className="resume-title-row"><FileJson2 aria-hidden="true" /><span>Resume library</span></div>
          <h1>Your story, ready to send.</h1>
          <p>Every JSON resume saved on this machine, rendered as a crisp, living document.</p>
        </div>
        <div className="resume-header-actions">
          <Button onClick={openCreateDialog}>
            <Plus /> Create resume
          </Button>
          <Button variant="outline" onClick={() => void openFolder()}><FolderOpen /> Open folder</Button>
          <Button variant="outline" size="icon" onClick={() => void refresh()} aria-label="Refresh resumes" title="Refresh resumes"><RefreshCw /></Button>
        </div>
      </header>

      <section className="resume-library-body">
        <div className="resume-toolbar">
          <InputGroup className="resume-search">
            <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
            <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resumes" aria-label="Search resumes" />
          </InputGroup>
        <div className="resume-count"><Grid2X2 aria-hidden="true" /> {filtered.length + filteredImports.length} {filtered.length + filteredImports.length === 1 ? "resume" : "resumes"}</div>
      </div>

        {loading ? <ResumeSkeletons /> : null}
        {error ? <div className="resume-empty"><h2>Something went wrong</h2><p>{error}</p></div> : null}
        {!loading && !error && (filtered.length || filteredImports.length) ? (
          <div className="resume-grid">
            {filteredImports.map((job) => <ResumeImportCard key={job.jobId} job={job} />)}
            {filtered.map((resume) => <ResumeCard key={resume.id} file={resume} onOpen={() => {
              onViewerChange?.(true)
              setSelected(resume)
            }} />)}
          </div>
        ) : null}
        {!loading && !error && !filtered.length && !filteredImports.length ? (
          <div className="resume-empty">
            <FileJson2 aria-hidden="true" />
            <h2>{query ? "No matching resumes" : "Your library is ready"}</h2>
            <p>{query ? "Try a name or file name." : "Add a JSON resume to the resume folder, then refresh."}</p>
          </div>
        ) : null}
      </section>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="resume-create-dialog">
          <form
            className="grid min-w-0 gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void createSelectedResume()
            }}
          >
            <DialogHeader>
              <DialogTitle>Create a resume</DialogTitle>
              <DialogDescription>
                {resumeCreationMode === "pdf"
                  ? "Choose the agent for this import. It will keep running in the background while you work."
                  : "Start with a blank resume and build it in the editor."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="resume-creation-mode">Starting point</Label>
              <NativeSelect
                id="resume-creation-mode"
                className="w-full"
                value={resumeCreationMode}
                onChange={(event) => {
                  setResumeCreationMode(event.target.value as ResumeCreationMode)
                  setCreateError("")
                }}
                disabled={creating}
              >
                <NativeSelectOption value="blank">Blank resume</NativeSelectOption>
                <NativeSelectOption value="pdf">Import from PDF with an agent</NativeSelectOption>
              </NativeSelect>
            </div>
            {resumeCreationMode === "pdf" ? (
              <div className="resume-import-selector grid min-w-0 gap-2">
                <Label>Agent</Label>
                <ModelReasoningSelector
                  value={resumeImportSelection}
                  onChange={setResumeImportSelection}
                  disabled={creating}
                />
              </div>
            ) : null}
            {resumeCreationMode === "pdf" ? (
              <div className="grid min-w-0 gap-2">
                <Label>PDF file</Label>
                <div className="flex min-w-0 items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => void chooseResumePdf()} disabled={creating}>
                    <FileUp /> Choose PDF
                  </Button>
                  <span className="min-w-0 truncate text-sm text-muted-foreground" title={resumePdfPath || undefined}>
                    {resumePdfPath ? getFileName(resumePdfPath) : "No PDF selected"}
                  </span>
                </div>
              </div>
            ) : null}
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="resume-name">
                Resume name{resumeCreationMode === "pdf" ? " (optional)" : ""}
              </Label>
              <Input
                id="resume-name"
                value={resumeName}
                onChange={(event) => setResumeName(event.target.value)}
                placeholder={resumeCreationMode === "pdf" ? "Leave blank to use the name in the PDF" : "e.g. Product designer"}
                autoFocus={resumeCreationMode === "blank"}
                disabled={creating}
              />
              {createError ? <p className="text-sm text-destructive" role="alert">{createError}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating || (resumeCreationMode === "blank" ? !resumeName.trim() : !resumePdfPath)}
              >
                {creating
                  ? (resumeCreationMode === "pdf" ? "Starting import..." : "Creating...")
                  : (resumeCreationMode === "pdf" ? "Start import" : "Create resume")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || path
}

function ResumeCard({ file, onOpen }: { file: ResumeFile; onOpen: () => void }) {
  const name = file.data.basics?.name || file.fileName.replace(/\.json$/i, "")
  const updated = file.updatedAt ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(file.updatedAt * 1000) : "Local preview"
  return (
    <Button variant="ghost" className="resume-card h-auto w-full p-0 font-normal" onClick={onOpen} aria-label={`Open ${name}`}>
      <div className="resume-card-preview" aria-hidden="true">
        <div className="resume-card-document" style={{ width: getResumePageWidth(file.data) }}><ResumeDocument resume={file.data} compact /></div>
      </div>
      <div className="resume-card-info">
        <div><h2>{name}</h2><p>Updated {updated}</p></div>
        <span>View <span aria-hidden="true">↗</span></span>
      </div>
    </Button>
  )
}

function ResumeImportCard({ job }: { job: ResumeImportJob }) {
  const isRunning = job.status === "queued" || job.status === "running"
  const activities = resumeImportActivities(job)
  const title = job.resumeName || job.pdfFileName
  const statusLabel = job.status === "failed"
    ? "Import failed"
    : isRunning
      ? "Importing"
      : "Imported"

  return (
    <article className={`resume-card resume-import-card is-${job.status}`} aria-label={`${title}: ${statusLabel}`}>
      <div className="resume-import-card-preview">
        <div className="resume-import-card-heading">
          <div className="resume-import-card-kicker">
            {job.status === "failed" ? <CircleX aria-hidden="true" /> : isRunning ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
            <span>{statusLabel}</span>
          </div>
          <Sparkles aria-hidden="true" />
        </div>
        <div className="resume-import-card-file">
          <FileUp aria-hidden="true" />
          <div>
            <strong>{job.pdfFileName}</strong>
            <span>{job.stage}</span>
          </div>
        </div>
        {activities.length ? (
          <div className="resume-import-card-trace">
            <AgentActivityTrace activities={activities} isStreaming={isRunning} />
          </div>
        ) : (
          <div className="resume-import-card-empty" role="status">
            {isRunning ? "Preparing the import activity…" : "No activity was recorded."}
          </div>
        )}
        {job.error ? (
          <p className="resume-import-card-error" role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{job.error}</span>
          </p>
        ) : null}
      </div>
      <div className="resume-card-info">
        <div>
          <h2>{title}</h2>
          <p>{modelLabel(job)} · {formatImportEffort(job.effort)}</p>
        </div>
        <span>{isRunning ? "Background" : statusLabel}</span>
      </div>
    </article>
  )
}

function resumeImportActivities(job: ResumeImportJob): AgentActivity[] {
  return job.activities.flatMap((event) => event.type === "item"
    ? [{
        id: event.id,
        kind: event.kind,
        status: event.status,
        eventType: event.eventType,
        item: event.item,
      }]
    : [])
}

function upsertResumeImport(current: ResumeImportJob[], next: ResumeImportJob) {
  const existingIndex = current.findIndex((job) => job.jobId === next.jobId)
  if (existingIndex === -1) return [next, ...current]
  return current.map((job, index) => index === existingIndex ? next : job)
}

function modelLabel(job: ResumeImportJob) {
  return ALL_AGENT_MODELS.find((model) => model.providerId === job.provider && model.id === job.model)?.name
    ?? job.model
    ?? (job.provider === "claude-code" ? "Claude Code" : "Codex")
}

function formatImportEffort(value: string | null) {
  if (!value || value === "auto") return "Default reasoning"
  if (value === "extra-high" || value === "xhigh") return "Extra High reasoning"
  return `${value.charAt(0).toUpperCase()}${value.slice(1)} reasoning`
}

type ResumeViewerProps = {
  file: ResumeFile
  onBack: (file: ResumeFile) => void
  targetJobId?: number
  backLabel?: string
  fullScreen?: boolean
}

export function ResumeViewer({
  file,
  onBack,
  targetJobId,
  backLabel = "Back to resume library",
  fullScreen = false,
}: ResumeViewerProps) {
  const [currentFile, setCurrentFile] = useState(file)
  const [zoom, setZoom] = useState(0.78)
  const [showPageGuides, setShowPageGuides] = useState(false)
  const [aiSidebarOpen, setAiSidebarOpen] = useState(true)
  const [aiSidebarWidth, setAiSidebarWidth] = useState(DEFAULT_AI_SIDEBAR_WIDTH)
  const [isAiSidebarResizing, setIsAiSidebarResizing] = useState(false)
  const [sectionsSidebarOpen, setSectionsSidebarOpen] = useState(true)
  const [sectionsSidebarWidth, setSectionsSidebarWidth] = useState(DEFAULT_SECTIONS_SIDEBAR_WIDTH)
  const [isSectionsSidebarResizing, setIsSectionsSidebarResizing] = useState(false)
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [saveError, setSaveError] = useState("")
  const [exportState, setExportState] = useState<"idle" | "exporting" | "exported" | "error">("idle")
  const [exportError, setExportError] = useState("")
  const [activeTextSelection, setActiveTextSelection] = useState<ResumeTextSelection | null>(null)
  const [selectionActionRequest, setSelectionActionRequest] = useState<ResumeSelectionActionRequest | null>(null)
  const [selectionResetKey, setSelectionResetKey] = useState(0)
  const [, setHistoryVersion] = useState(0)
  const [documentRevision, setDocumentRevision] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)
  const latestFileRef = useRef(file)
  const revisionRef = useRef(0)
  const persistedRevisionRef = useRef(0)
  const queuedSaveRevisionRef = useRef(0)
  const saveTimerRef = useRef<number | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const undoStackRef = useRef<ResumeFile["data"][]>([])
  const redoStackRef = useRef<ResumeFile["data"][]>([])
  const textEditRef = useRef<ResumeTextEdit | null>(null)
  const aiChatActivatedRef = useRef(false)
  const aiActivationPromiseRef = useRef<Promise<void> | null>(null)
  const aiChangeCountRef = useRef(0)
  const selectionRestoreRef = useRef<(() => void) | null>(null)
  const selectionRequestIdRef = useRef(0)
  const aiSidebarResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const sectionsSidebarResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const name = currentFile.data.basics?.name || currentFile.fileName
  const pageWidth = getResumePageWidth(currentFile.data)
  const sections = useMemo(
    () => getResumeSectionEntries(currentFile.data, { includeHidden: true }),
    [currentFile.data],
  )

  const enqueueSave = useCallback((snapshot: ResumeFile, revision: number) => {
    const task = saveQueueRef.current.then(async () => {
      try {
        const saved = await saveResume(
          snapshot,
          snapshot.data,
          targetJobId === undefined ? undefined : { jobId: targetJobId },
        )
        if (revisionRef.current === revision) {
          latestFileRef.current = saved
          setCurrentFile(saved)
          persistedRevisionRef.current = revision
          setSaveState("saved")
          setSaveError("")
        }
      } catch (reason) {
        if (revisionRef.current === revision) {
          if (queuedSaveRevisionRef.current === revision) {
            queuedSaveRevisionRef.current = persistedRevisionRef.current
          }
          setSaveState("error")
          setSaveError(reason instanceof Error ? reason.message : "Could not save this resume.")
        }
        throw reason
      }
    })
    saveQueueRef.current = task.catch(() => undefined)
    return task
  }, [targetJobId])

  const queueSave = useCallback((snapshot: ResumeFile, revision: number) => {
    if (queuedSaveRevisionRef.current >= revision) return null
    queuedSaveRevisionRef.current = revision
    return enqueueSave(snapshot, revision)
  }, [enqueueSave])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      const task = queueSave(latestFileRef.current, revisionRef.current)
      if (task) void task.catch(() => undefined)
    }, 300)
  }, [queueSave])

  const refreshHistoryControls = useCallback(() => {
    setHistoryVersion((version) => version + 1)
  }, [])

  const applyResumeData = useCallback((data: ResumeFile["data"], saveMode: ResumeSaveMode = "debounced") => {
    if (data === latestFileRef.current.data) return
    const nextFile = { ...latestFileRef.current, data }
    latestFileRef.current = nextFile
    revisionRef.current += 1
    selectionRestoreRef.current = null
    setActiveTextSelection(null)
    setSelectionResetKey((version) => version + 1)
    setCurrentFile(nextFile)
    setSaveState("saving")
    setSaveError("")
    if (saveMode === "immediate") {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      const task = queueSave(nextFile, revisionRef.current)
      if (task) void task.catch(() => undefined)
    } else {
      scheduleSave()
    }
  }, [queueSave, scheduleSave])

  const commitTextEdit = useCallback(() => {
    const edit = textEditRef.current
    if (!edit) return

    if (edit.changed && !areResumeDataEqual(latestFileRef.current.data, edit.before)) {
      undoStackRef.current.push(edit.before)
    }
    textEditRef.current = null
    refreshHistoryControls()
  }, [refreshHistoryControls])

  const beginTextEdit = useCallback((key: string) => {
    if (textEditRef.current) commitTextEdit()
    textEditRef.current = {
      key,
      before: latestFileRef.current.data,
      redoBefore: [...redoStackRef.current],
      changed: false,
    }
    refreshHistoryControls()
  }, [commitTextEdit, refreshHistoryControls])

  const finishTextEdit = useCallback(() => {
    commitTextEdit()
  }, [commitTextEdit])

  const cancelTextEdit = useCallback((key: string, data: ResumeFile["data"]) => {
    const edit = textEditRef.current
    if (!edit || edit.key !== key) {
      applyResumeData(data)
      return
    }

    textEditRef.current = null
    applyResumeData(data)
    redoStackRef.current = edit.redoBefore
    refreshHistoryControls()
  }, [applyResumeData, refreshHistoryControls])

  const handleResumeChange = useCallback((data: ResumeFile["data"], meta?: ResumeChangeMeta, options?: { saveMode?: ResumeSaveMode }) => {
    const previousData = latestFileRef.current.data
    if (data === previousData) return

    const activeTextEdit = textEditRef.current
    if (activeTextEdit && meta?.kind === "text" && activeTextEdit.key === meta.key) {
      if (!activeTextEdit.changed) {
        activeTextEdit.changed = true
        redoStackRef.current = []
        refreshHistoryControls()
      }
      applyResumeData(data, options?.saveMode)
      return
    }

    if (activeTextEdit) commitTextEdit()
    undoStackRef.current.push(previousData)
    redoStackRef.current = []
    refreshHistoryControls()
    applyResumeData(data, options?.saveMode)

    // A sidebar action can happen while the inline editor is still mounted.
    // Start a fresh text transaction after that structural action so the next
    // keystrokes remain grouped as one edit.
    if (activeTextEdit && !meta) {
      textEditRef.current = {
        key: activeTextEdit.key,
        before: data,
        redoBefore: [],
        changed: false,
      }
    }
  }, [applyResumeData, commitTextEdit, refreshHistoryControls])

  const handleSidebarResumeChange = useCallback((data: ResumeFile["data"]) => {
    // Sidebar settings are committed document changes, so persist them without
    // the typing debounce used by the inline editor.
    handleResumeChange(data, undefined, { saveMode: "immediate" })
  }, [handleResumeChange])

  const handleUndo = useCallback(() => {
    commitTextEdit()
    const previousData = undoStackRef.current.pop()
    if (!previousData) {
      refreshHistoryControls()
      return
    }

    redoStackRef.current.push(latestFileRef.current.data)
    applyResumeData(previousData)
    setDocumentRevision((revision) => revision + 1)
    refreshHistoryControls()
  }, [applyResumeData, commitTextEdit, refreshHistoryControls])

  const handleRedo = useCallback(() => {
    commitTextEdit()
    const nextData = redoStackRef.current.pop()
    if (!nextData) {
      refreshHistoryControls()
      return
    }

    undoStackRef.current.push(latestFileRef.current.data)
    applyResumeData(nextData)
    setDocumentRevision((revision) => revision + 1)
    refreshHistoryControls()
  }, [applyResumeData, commitTextEdit, refreshHistoryControls])

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    while (revisionRef.current > persistedRevisionRef.current) {
      const task = queueSave(latestFileRef.current, revisionRef.current)
      if (task) {
        await task
      } else {
        await saveQueueRef.current
      }
    }
    await saveQueueRef.current
  }, [queueSave])

  const activateAiChat = useCallback(() => {
    if (aiChatActivatedRef.current) return flushPendingSave()
    if (aiActivationPromiseRef.current) return aiActivationPromiseRef.current

    const activation = (async () => {
      commitTextEdit()
      await flushPendingSave()

      undoStackRef.current.push(latestFileRef.current.data)
      redoStackRef.current = []
      aiChatActivatedRef.current = true
      refreshHistoryControls()
    })()

    aiActivationPromiseRef.current = activation
    void activation.catch(() => {
      aiActivationPromiseRef.current = null
    })
    return activation
  }, [commitTextEdit, flushPendingSave, refreshHistoryControls])

  const handleAiApply = useCallback((data: ResumeFile["data"], changed: boolean) => {
    const previousData = latestFileRef.current.data
    const didChange = changed && !areResumeDataEqual(previousData, data)

    if (didChange) {
      if (aiChangeCountRef.current === 0) {
        // The activation checkpoint already owns the first undo step.
        applyResumeData(data)
      } else {
        handleResumeChange(data)
      }
      aiChangeCountRef.current += 1
    }
  }, [applyResumeData, handleResumeChange])

  const handleTextSelection = useCallback((selection: ResumeTextSelection | null) => {
    setActiveTextSelection(selection)
    if (!selection) selectionRestoreRef.current = null
  }, [])

  const handleSelectionRestoreChange = useCallback((restore: (() => void) | null) => {
    selectionRestoreRef.current = restore
  }, [])

  const handleSelectionAction = useCallback((action: ResumeSelectionAction, selection: ResumeTextSelection) => {
    setActiveTextSelection(selection)
    selectionRequestIdRef.current += 1
    setSelectionActionRequest({ id: selectionRequestIdRef.current, action, selection })
    setAiSidebarOpen(true)
  }, [])

  const handleClearTextSelection = useCallback(() => {
    selectionRestoreRef.current?.()
    selectionRestoreRef.current = null
    setActiveTextSelection(null)
  }, [])

  const clampAiSidebarWidth = useCallback((width: number) => {
    return Math.min(MAX_AI_SIDEBAR_WIDTH, Math.max(MIN_AI_SIDEBAR_WIDTH, width))
  }, [])

  const handleAiSidebarResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!aiSidebarOpen) return

    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    aiSidebarResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: aiSidebarWidth,
    }
    setIsAiSidebarResizing(true)
  }, [aiSidebarOpen, aiSidebarWidth])

  const handleAiSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = aiSidebarResizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return

    setAiSidebarWidth(clampAiSidebarWidth(resize.startWidth + event.clientX - resize.startX))
  }, [clampAiSidebarWidth])

  const finishAiSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = aiSidebarResizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    aiSidebarResizeRef.current = null
    setIsAiSidebarResizing(false)
  }, [])

  const handleAiSidebarResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault()
      setAiSidebarWidth((width) => clampAiSidebarWidth(width + (event.key === "ArrowRight" ? step : -step)))
      return
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      setAiSidebarWidth(event.key === "Home" ? MIN_AI_SIDEBAR_WIDTH : MAX_AI_SIDEBAR_WIDTH)
    }
  }, [clampAiSidebarWidth])

  const clampSectionsSidebarWidth = useCallback((width: number) => {
    return Math.min(MAX_SECTIONS_SIDEBAR_WIDTH, Math.max(MIN_SECTIONS_SIDEBAR_WIDTH, width))
  }, [])

  const handleSectionsSidebarResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!sectionsSidebarOpen) return

    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    sectionsSidebarResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sectionsSidebarWidth,
    }
    setIsSectionsSidebarResizing(true)
  }, [sectionsSidebarOpen, sectionsSidebarWidth])

  const handleSectionsSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = sectionsSidebarResizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return

    setSectionsSidebarWidth(clampSectionsSidebarWidth(resize.startWidth + resize.startX - event.clientX))
  }, [clampSectionsSidebarWidth])

  const finishSectionsSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = sectionsSidebarResizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    sectionsSidebarResizeRef.current = null
    setIsSectionsSidebarResizing(false)
  }, [])

  const handleSectionsSidebarResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault()
      setSectionsSidebarWidth((width) => clampSectionsSidebarWidth(width + (event.key === "ArrowLeft" ? step : -step)))
      return
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      setSectionsSidebarWidth(event.key === "Home" ? MIN_SECTIONS_SIDEBAR_WIDTH : MAX_SECTIONS_SIDEBAR_WIDTH)
    }
  }, [clampSectionsSidebarWidth])

  const handleSectionSelect = useCallback((sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  const handleSectionReorder = useCallback((sourceKey: string, targetKey: string, position: ResumeSectionDropPosition) => {
    handleSidebarResumeChange(reorderResumeSections(latestFileRef.current.data, sourceKey, targetKey, position))
  }, [handleSidebarResumeChange])

  const handleSectionAdd = useCallback((key: string, lane: ResumeSectionLane) => {
    handleSidebarResumeChange(addResumeSection(latestFileRef.current.data, key, lane))
  }, [handleSidebarResumeChange])

  const handleSectionRemove = useCallback((key: string) => {
    handleSidebarResumeChange(removeResumeSection(latestFileRef.current.data, key))
  }, [handleSidebarResumeChange])

  const handleSectionToggleHidden = useCallback((key: string, hidden: boolean) => {
    handleSidebarResumeChange(setResumeSectionHidden(latestFileRef.current.data, key, hidden))
  }, [handleSidebarResumeChange])

  const handleSectionColumnsChange = useCallback((key: string, columns: number) => {
    handleSidebarResumeChange(setResumeSectionColumns(latestFileRef.current.data, key, columns))
  }, [handleSidebarResumeChange])

  const handleSectionTextAlignmentChange = useCallback((key: string, alignment: ResumeSectionAlignment) => {
    handleSidebarResumeChange(setResumeSectionTextAlignment(latestFileRef.current.data, key, alignment))
  }, [handleSidebarResumeChange])

  const handleSectionPageAlignmentChange = useCallback((key: string, pageAlignment: ResumeSectionAlignment) => {
    handleSidebarResumeChange(setResumeSectionPageAlignment(latestFileRef.current.data, key, pageAlignment))
  }, [handleSidebarResumeChange])

  const handleSectionItemAdd = useCallback((key: string) => {
    handleSidebarResumeChange(addResumeSectionItem(latestFileRef.current.data, key))
  }, [handleSidebarResumeChange])

  const handleSectionItemRemove = useCallback((key: string, itemIndex: number) => {
    handleSidebarResumeChange(removeResumeSectionItem(latestFileRef.current.data, key, itemIndex))
  }, [handleSidebarResumeChange])

  const handleSectionItemToggleHidden = useCallback((key: string, itemIndex: number, hidden: boolean) => {
    handleSidebarResumeChange(setResumeSectionItemHidden(latestFileRef.current.data, key, itemIndex, hidden))
  }, [handleSidebarResumeChange])

  const handleSectionItemReorder = useCallback((key: string, sourceIndex: number, targetIndex: number, position: ResumeSectionItemDropPosition) => {
    handleSidebarResumeChange(reorderResumeSectionItems(latestFileRef.current.data, key, sourceIndex, targetIndex, position))
  }, [handleSidebarResumeChange])

  const handleBack = useCallback(async () => {
    try {
      await flushPendingSave()
      onBack(latestFileRef.current)
    } catch {
      // Keep the editor open when the final save fails so the user can retry.
    }
  }, [flushPendingSave, onBack])

  const handleExport = useCallback(async () => {
    if (exportState === "exporting") return
    commitTextEdit()
    setExportState("exporting")
    setExportError("")
    try {
      await flushPendingSave()
      if (document.fonts?.ready) await document.fonts.ready
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

      const defaultName = `${pdfFileStem(latestFileRef.current.data.basics?.name || latestFileRef.current.fileName)}.pdf`
      const destination = await save({
        defaultPath: defaultName,
        filters: [{ name: "PDF document", extensions: ["pdf"] }],
      })
      if (!destination) {
        setExportState("idle")
        return
      }

      await exportResumePdf(destination)
      setExportState("exported")
    } catch (reason) {
      setExportState("error")
      setExportError(reason instanceof Error ? reason.message : String(reason || "Could not export this resume."))
    }
  }, [commitTextEdit, exportState, flushPendingSave])

  const changeZoom = useCallback((factor: number) => {
    setZoom((current) => Math.max(MIN_ZOOM, current * factor))
  }, [])

  const fit = useCallback(() => {
    const width = viewportRef.current?.clientWidth ?? 1000
    setZoom(Math.max(MIN_ZOOM, (width - 96) / pageWidth))
  }, [pageWidth])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") void handleBack()
      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (modifier && key === "z") {
        event.preventDefault()
        if (event.shiftKey) handleRedo()
        else handleUndo()
        return
      }
      if (modifier && key === "y") {
        event.preventDefault()
        handleRedo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && ["+", "="].includes(event.key)) {
        event.preventDefault(); changeZoom(1.2)
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "-") {
        event.preventDefault(); changeZoom(1 / 1.2)
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "0") {
        event.preventDefault(); fit()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [changeZoom, fit, handleBack, handleRedo, handleUndo])

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    changeZoom(event.deltaY < 0 ? 1.12 : 1 / 1.12)
  }

  const zoomStyle = { zoom } as CSSProperties
  const canUndo = undoStackRef.current.length > 0 || Boolean(textEditRef.current?.changed)
  const canRedo = redoStackRef.current.length > 0

  const viewerStyle = {
    "--resume-ai-sidebar-width": `min(${aiSidebarWidth}px, 84vw)`,
    "--resume-ai-sidebar-min-width": `${MIN_AI_SIDEBAR_WIDTH}px`,
    "--resume-sections-sidebar-size": `${sectionsSidebarWidth}px`,
  } as CSSProperties

  return (
    <main className={`resume-viewer ${fullScreen ? "fixed inset-0 z-50" : ""} ${aiSidebarOpen ? "has-ai-sidebar" : "is-ai-sidebar-collapsed"} ${sectionsSidebarOpen ? "has-sections-sidebar" : "is-sections-sidebar-collapsed"} ${isAiSidebarResizing ? "is-ai-sidebar-resizing" : ""} ${isSectionsSidebarResizing ? "is-sections-sidebar-resizing" : ""}`.trim()} style={viewerStyle}>
      <header className="resume-viewer-header">
        <Button variant="ghost" size="icon" onClick={() => void handleBack()} aria-label={backLabel}><ArrowLeft /></Button>
        {!aiSidebarOpen ? (
          <Button
            variant="ghost"
            size="sm"
            className="resume-ai-toggle"
            onClick={() => setAiSidebarOpen(true)}
            aria-label="Show AI assistant"
            aria-controls="resume-ai-sidebar"
            aria-expanded={false}
            title="Show AI assistant"
          >
            <PanelLeftOpen aria-hidden="true" />
            <span>AI chat</span>
          </Button>
        ) : null}
        <div className="resume-viewer-title"><h1>{name}</h1><p>{currentFile.fileName}</p></div>
        <div className="resume-viewer-actions">
          <div className={`resume-save-state is-${saveState}`} role="status" aria-live="polite" title={saveError || undefined}>
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}
          </div>
          <div className="resume-history-actions" role="toolbar" aria-label="Resume history">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleUndo}
              disabled={!canUndo}
              aria-label="Undo last change"
              title="Undo last change (Ctrl+Z)"
            >
              <Undo2 aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleRedo}
              disabled={!canRedo}
              aria-label="Redo last undone change"
              title="Redo last undone change (Ctrl+Shift+Z)"
            >
              <Redo2 aria-hidden="true" />
            </Button>
          </div>
          <div className="resume-viewer-hint">Ctrl + scroll to zoom</div>
          <Button
            variant="default"
            size="sm"
            onClick={() => void handleExport()}
            disabled={exportState === "exporting"}
            aria-describedby={exportError ? "resume-export-status" : undefined}
            title="Export this resume as a PDF matching the editor layout"
          >
            {exportState === "exporting"
              ? <LoaderCircle className="animate-spin" aria-hidden="true" />
              : exportState === "exported"
                ? <CircleCheck aria-hidden="true" />
                : <FileDown aria-hidden="true" />}
            <span>{exportState === "exporting" ? "Exporting…" : exportState === "exported" ? "Exported" : "Export PDF"}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="resume-page-guides-toggle"
            data-active={showPageGuides ? "true" : "false"}
            onClick={() => setShowPageGuides((visible) => !visible)}
            aria-label={showPageGuides ? "Hide PDF page guides" : "Show PDF page guides"}
            aria-pressed={showPageGuides}
            title={showPageGuides ? "Hide PDF page guides" : "Show PDF page guides"}
          >
            <Ruler aria-hidden="true" />
            <span>Page guides</span>
          </Button>
          {!sectionsSidebarOpen ? (
            <Button
              variant="ghost"
              size="sm"
              className="resume-sections-toggle"
              onClick={() => setSectionsSidebarOpen(true)}
              aria-label="Show resume sections"
              aria-controls="resume-section-sidebar"
              aria-expanded={false}
              title="Show resume sections"
            >
              <PanelRightOpen aria-hidden="true" />
              <span>Sections</span>
            </Button>
          ) : null}
        </div>
      </header>
      <div className="resume-viewer-content">
        <ResumeAiSidebar
          resumePath={currentFile.path}
          enableJobTargeting
          targetJobId={targetJobId}
          isOpen={aiSidebarOpen}
          onToggle={() => setAiSidebarOpen((open) => !open)}
          onActivate={activateAiChat}
          onApply={handleAiApply}
          textSelection={activeTextSelection}
          selectionActionRequest={selectionActionRequest}
          onClearTextSelection={handleClearTextSelection}
        />
        <div
          className="resume-ai-resize-handle"
          role="separator"
          tabIndex={aiSidebarOpen ? 0 : -1}
          aria-label="Resize AI assistant panel"
          aria-orientation="vertical"
          aria-valuemin={MIN_AI_SIDEBAR_WIDTH}
          aria-valuemax={MAX_AI_SIDEBAR_WIDTH}
          aria-valuenow={Math.round(aiSidebarWidth)}
          title="Drag to resize AI assistant"
          onKeyDown={handleAiSidebarResizeKeyDown}
          onPointerDown={handleAiSidebarResizeStart}
          onPointerMove={handleAiSidebarResize}
          onPointerUp={finishAiSidebarResize}
          onPointerCancel={finishAiSidebarResize}
          onLostPointerCapture={() => {
            aiSidebarResizeRef.current = null
            setIsAiSidebarResizing(false)
          }}
        />
        <div
          className="resume-sections-resize-handle"
          role="separator"
          tabIndex={sectionsSidebarOpen ? 0 : -1}
          aria-label="Resize resume sections panel"
          aria-orientation="vertical"
          aria-valuemin={MIN_SECTIONS_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SECTIONS_SIDEBAR_WIDTH}
          aria-valuenow={Math.round(sectionsSidebarWidth)}
          title="Drag to resize resume sections"
          onKeyDown={handleSectionsSidebarResizeKeyDown}
          onPointerDown={handleSectionsSidebarResizeStart}
          onPointerMove={handleSectionsSidebarResize}
          onPointerUp={finishSectionsSidebarResize}
          onPointerCancel={finishSectionsSidebarResize}
          onLostPointerCapture={() => {
            sectionsSidebarResizeRef.current = null
            setIsSectionsSidebarResizing(false)
          }}
        />
        <div className="resume-viewport" ref={viewportRef} onWheel={onWheel}>
          <div className="resume-zoom-stage" style={{ ...zoomStyle, width: pageWidth }}>
            <ResumeDocument
              key={documentRevision}
              resume={currentFile.data}
              showPageGuides={showPageGuides}
              onChange={handleResumeChange}
              onEditStart={beginTextEdit}
              onEditEnd={finishTextEdit}
              onEditCancel={cancelTextEdit}
              onTextSelection={handleTextSelection}
              onSelectionAction={handleSelectionAction}
              onSelectionRestoreChange={handleSelectionRestoreChange}
              selectionResetKey={selectionResetKey}
            />
          </div>
        </div>
        {sectionsSidebarOpen ? (
          <ResumeSectionsSidebar
            resume={currentFile.data}
            sections={sections}
            onSelect={handleSectionSelect}
            onReorder={handleSectionReorder}
            onAdd={handleSectionAdd}
            onChange={handleSidebarResumeChange}
            onRemove={handleSectionRemove}
            onToggleHidden={handleSectionToggleHidden}
            onColumnsChange={handleSectionColumnsChange}
            onTextAlignmentChange={handleSectionTextAlignmentChange}
            onPageAlignmentChange={handleSectionPageAlignmentChange}
            onAddItem={handleSectionItemAdd}
            onRemoveItem={handleSectionItemRemove}
            onToggleItemHidden={handleSectionItemToggleHidden}
            onReorderItem={handleSectionItemReorder}
            onToggle={() => setSectionsSidebarOpen(false)}
          />
        ) : null}
      </div>
      <div className="resume-export-root" aria-hidden="true">
        <ResumeDocument resume={currentFile.data} showPageGuides={false} />
      </div>
      {exportError ? <p id="resume-export-status" className="resume-export-error" role="alert">{exportError}</p> : null}
      <div className="resume-zoom-controls" role="toolbar" aria-label="Resume zoom controls">
        <Button variant="ghost" size="icon" onClick={() => changeZoom(1 / 1.2)} aria-label="Zoom out"><Minus /></Button>
        <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        <Button variant="ghost" size="icon" onClick={() => changeZoom(1.2)} aria-label="Zoom in"><Plus /></Button>
        <span className="resume-control-separator" />
        <Button variant="ghost" size="icon" onClick={fit} aria-label="Fit resume to width" title="Fit to width"><Maximize2 /></Button>
      </div>
    </main>
  )
}

function pdfFileStem(value: string) {
  const withoutExtension = value.replace(/\.json$/i, "")
  return withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "resume"
}

export function ResumeSectionsSidebar({
  resume,
  sections,
  onSelect,
  onReorder,
  onAdd,
  onChange,
  onRemove,
  onToggleHidden,
  onColumnsChange,
  onTextAlignmentChange,
  onPageAlignmentChange,
  onAddItem,
  onRemoveItem,
  onToggleItemHidden,
  onReorderItem,
  onToggle,
}: {
  resume: ResumeFile["data"]
  sections: ReturnType<typeof getResumeSectionEntries>
  onSelect: (sectionId: string) => void
  onReorder: (sourceKey: string, targetKey: string, position: ResumeSectionDropPosition) => void
  onAdd: (key: string, lane: ResumeSectionLane) => void
  onChange: (resume: ResumeFile["data"]) => void
  onRemove: (key: string) => void
  onToggleHidden: (key: string, hidden: boolean) => void
  onColumnsChange: (key: string, columns: number) => void
  onTextAlignmentChange: (key: string, alignment: ResumeSectionAlignment) => void
  onPageAlignmentChange: (key: string, pageAlignment: ResumeSectionAlignment) => void
  onAddItem: (key: string) => void
  onRemoveItem: (key: string, itemIndex: number) => void
  onToggleItemHidden: (key: string, itemIndex: number, hidden: boolean) => void
  onReorderItem: (key: string, sourceIndex: number, targetIndex: number, position: ResumeSectionItemDropPosition) => void
  onToggle: () => void
}) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [sectionPlacement, setSectionPlacement] = useState<ResumeSectionLane>("sidebar")
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const [draggedKey, setDraggedKey] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ key: string; position: ResumeSectionDropPosition } | null>(null)
  const pointerDragRef = useRef<{
    key: string
    pointerId: number
    startX: number
    startY: number
    active: boolean
  } | null>(null)
  const dropTargetRef = useRef<{ key: string; position: ResumeSectionDropPosition } | null>(null)
  const suppressClickRef = useRef(false)
  const availableSections = getResumeSectionOptions(resume).filter((section) => section.status === "removed")
  const hiddenSections = sections.filter((section) => section.hidden)
  const visibleSections = sections.length - hiddenSections.length

  function clearDragState() {
    pointerDragRef.current = null
    dropTargetRef.current = null
    setDraggedKey(null)
    setDropTarget(null)
  }

  function updateDropTarget(clientX: number, clientY: number, sourceKey: string) {
    const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-section-key]")
    const targetKey = element?.dataset.sectionKey
    if (!targetKey || targetKey === sourceKey) {
      dropTargetRef.current = null
      setDropTarget(null)
      return null
    }

    const bounds = element.getBoundingClientRect()
    const nextTarget = {
      key: targetKey,
      position: clientY < bounds.top + bounds.height / 2 ? "before" : "after",
    } satisfies { key: string; position: ResumeSectionDropPosition }
    dropTargetRef.current = nextTarget
    setDropTarget(nextTarget)
    return nextTarget
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>, key: string) {
    if (event.button !== 0) return
    pointerDragRef.current = {
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic pointer events and a few embedded webviews do not expose capture.
      // The window listeners below still receive the gesture in those environments.
    }
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = pointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      if (!drag.active) {
        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
        if (distance < 5) return
        drag.active = true
        suppressClickRef.current = true
        setDraggedKey(drag.key)
      }

      event.preventDefault()
      updateDropTarget(event.clientX, event.clientY, drag.key)
    }

    function handlePointerUp(event: PointerEvent) {
      const drag = pointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      if (drag.active) {
        const target = updateDropTarget(event.clientX, event.clientY, drag.key)
        if (target) onReorder(drag.key, target.key, target.position)
      }
      clearDragState()
      if (drag.active) window.setTimeout(() => { suppressClickRef.current = false }, 0)
    }

    function handlePointerCancel(event: PointerEvent) {
      const drag = pointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      suppressClickRef.current = false
      clearDragState()
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false })
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
    }
  }, [onReorder])

  function handleSectionClick(sectionId: string) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onSelect(sectionId)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, key: string) {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return
    const index = sections.findIndex((section) => section.key === key)
    const target = sections[index + (event.key === "ArrowUp" ? -1 : 1)]
    if (!target) return

    event.preventDefault()
    onReorder(key, target.key, event.key === "ArrowUp" ? "before" : "after")
  }

  function handleSectionItemSelect(key: string, itemIndex: number) {
    const item = Array.from(document.querySelectorAll<HTMLElement>("[data-resume-item-section][data-resume-item-index]")).find((candidate) => (
      candidate.dataset.resumeItemSection === key && candidate.dataset.resumeItemIndex === String(itemIndex)
    ))
    item?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  return (
    <aside className="resume-sections-sidebar" id="resume-section-sidebar" aria-label="Resume sections">
      <div className="resume-sections-sidebar-header">
          <div>
            <div className="resume-sections-kicker"><ListTree aria-hidden="true" /><span>Document outline</span></div>
            <h2>Sections</h2>
            <p className="resume-sections-sidebar-description">
              {visibleSections} visible{hiddenSections.length ? ` · ${hiddenSections.length} hidden` : ""}
            </p>
          </div>
        <div className="resume-sections-sidebar-actions">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setAddDialogOpen(true)}
            aria-label="Add a section"
            title="Add a section"
          >
            <Plus aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggle}
            aria-label="Hide resume sections"
            aria-controls="resume-section-sidebar"
            aria-expanded={true}
            title="Hide resume sections"
          >
            <PanelRightClose aria-hidden="true" />
          </Button>
          <span className="resume-sections-count">{sections.length}</span>
        </div>
      </div>
      {sections.length ? (
        <nav aria-label="Resume section list">
          <ol className={`resume-sections-list ${draggedKey ? "is-dragging" : ""}`}>
            {sections.map((section, index) => {
              const isDragging = draggedKey === section.key
              const isDropTarget = dropTarget?.key === section.key
              const dropClass = isDropTarget ? `is-drop-${dropTarget.position}` : ""
              const isExpanded = expandedSections[section.key] ?? false
              const itemsId = `resume-section-items-${index}`

              return (
                <li
                  key={section.key}
                  className={`${isDragging ? "is-dragging" : ""} ${dropClass}`.trim()}
                  data-section-key={section.key}
                >
                  <div className="resume-section-row">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="resume-section-expand"
                      type="button"
                      onClick={() => setExpandedSections((current) => ({ ...current, [section.key]: !isExpanded }))}
                      disabled={!section.supportsItems}
                      aria-expanded={section.supportsItems ? isExpanded : undefined}
                      aria-controls={section.supportsItems ? itemsId : undefined}
                      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${section.title} items`}
                      title={section.supportsItems ? `${isExpanded ? "Collapse" : "Expand"} ${section.title} items` : "This section has no individual items"}
                    >
                      {isExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                    </Button>
                    <Button
                      variant="ghost"
                      className={`resume-section-link ${section.hidden ? "is-hidden" : ""}`}
                      type="button"
                      onClick={() => { if (!section.hidden) handleSectionClick(section.id) }}
                      onKeyDown={(event) => { if (!section.hidden) handleKeyDown(event, section.key) }}
                      onPointerDown={section.hidden ? undefined : (event) => handlePointerDown(event, section.key)}
                      aria-label={`${section.title}${section.hidden ? " (hidden)" : ""}`}
                      aria-disabled={section.hidden}
                      title={section.hidden ? "Hidden from the resume" : "Drag to reorder (Alt + Arrow keys to move)"}
                    >
                      <span
                        className="resume-section-drag-handle"
                        aria-hidden="true"
                      >
                        <GripVertical />
                      </span>
                      <span className="resume-section-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="resume-section-link-copy">
                        <span className="resume-section-link-title">
                          <span className="resume-section-folder-icon" aria-hidden="true">
                            {isExpanded ? <FolderOpen /> : <Folder />}
                          </span>
                          <span>{section.title}</span>
                        </span>
                        <span className="resume-section-link-detail">{section.hidden ? "Hidden from resume" : section.detail}</span>
                      </span>
                    </Button>
                    <div className="resume-section-actions">
                      {section.supportsColumns ? (
                        <SectionColumnsPopover
                          section={section}
                          onChange={(columns) => onColumnsChange(section.key, columns)}
                          onTextAlignmentChange={(alignment) => onTextAlignmentChange(section.key, alignment)}
                          onPageAlignmentChange={(pageAlignment) => onPageAlignmentChange(section.key, pageAlignment)}
                        />
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onToggleHidden(section.key, !section.hidden)}
                        aria-label={`${section.hidden ? "Show" : "Hide"} ${section.title}`}
                        title={`${section.hidden ? "Show" : "Hide"} ${section.title}`}
                      >
                        {section.hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onRemove(section.key)}
                        aria-label={`Remove ${section.title}`}
                        title={`Remove ${section.title} from the document`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  {section.supportsItems && isExpanded ? (
                    section.type === "skills" ? (
                      <ResumeSkillsSection
                        resume={resume}
                        sectionKey={section.key}
                        sectionTitle={section.title}
                        onChange={onChange}
                      />
                    ) : (
                      <ResumeSectionItemsFolder
                        id={itemsId}
                        resume={resume}
                        section={section}
                        onSelect={handleSectionItemSelect}
                        onAdd={onAddItem}
                        onRemove={onRemoveItem}
                        onToggleHidden={onToggleItemHidden}
                        onReorder={onReorderItem}
                      />
                    )
                  ) : null}
                </li>
              )
            })}
          </ol>
        </nav>
      ) : (
        <p className="resume-sections-empty">No visible sections in this resume.</p>
      )}
      <ResumeDesignPanel resume={resume} onChange={onChange} />
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="resume-section-dialog">
          <DialogHeader>
            <DialogTitle>Add a section</DialogTitle>
            <DialogDescription>Choose a section from the resume schema to add to this document. Hidden sections stay in the outline so they can be shown directly.</DialogDescription>
          </DialogHeader>
          <div className="resume-section-placement">
            <Label htmlFor="resume-section-placement">Place new section in</Label>
            <NativeSelect
              id="resume-section-placement"
              className="w-full"
              value={sectionPlacement}
              onChange={(event) => setSectionPlacement(event.currentTarget.value as ResumeSectionLane)}
            >
              <NativeSelectOption value="sidebar">Right sidebar</NativeSelectOption>
              <NativeSelectOption value="main">Main column</NativeSelectOption>
            </NativeSelect>
          </div>
          {availableSections.length ? (
            <div className="resume-section-options">
              {availableSections.map((section) => (
                <div className="resume-section-option" key={section.key}>
                  <div>
                    <strong>{section.title}</strong>
                    <span>Not in document</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onAdd(section.key, sectionPlacement)
                      setAddDialogOpen(false)
                    }}
                  >
                    <Plus aria-hidden="true" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="resume-sections-empty">All schema sections are already in this document. Use the eye button beside a hidden section to show it again.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}

function ResumeSectionItemsFolder({
  id,
  resume,
  section,
  onSelect,
  onAdd,
  onRemove,
  onToggleHidden,
  onReorder,
}: {
  id: string
  resume: ResumeFile["data"]
  section: ReturnType<typeof getResumeSectionEntries>[number]
  onSelect: (key: string, itemIndex: number) => void
  onAdd: (key: string) => void
  onRemove: (key: string, itemIndex: number) => void
  onToggleHidden: (key: string, itemIndex: number, hidden: boolean) => void
  onReorder: (key: string, sourceIndex: number, targetIndex: number, position: ResumeSectionItemDropPosition) => void
}) {
  const items = getResumeSectionItemEntries(resume, section.key)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<{ index: number; position: ResumeSectionItemDropPosition } | null>(null)
  const pointerDragRef = useRef<{
    index: number
    pointerId: number
    startX: number
    startY: number
    active: boolean
  } | null>(null)
  const dropTargetRef = useRef<{ index: number; position: ResumeSectionItemDropPosition } | null>(null)
  const suppressClickRef = useRef(false)

  function clearDragState() {
    pointerDragRef.current = null
    dropTargetRef.current = null
    setDraggedIndex(null)
    setDropTarget(null)
  }

  function updateDropTarget(clientX: number, clientY: number, sourceIndex: number) {
    const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-sidebar-item-index]")
    const targetIndex = Number(element?.dataset.sidebarItemIndex)
    if (!element || !Number.isInteger(targetIndex) || targetIndex === sourceIndex) {
      dropTargetRef.current = null
      setDropTarget(null)
      return null
    }

    const bounds = element.getBoundingClientRect()
    const nextTarget = {
      index: targetIndex,
      position: clientY < bounds.top + bounds.height / 2 ? "before" : "after",
    } satisfies { index: number; position: ResumeSectionItemDropPosition }
    dropTargetRef.current = nextTarget
    setDropTarget(nextTarget)
    return nextTarget
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (event.button !== 0) return
    pointerDragRef.current = {
      index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Window listeners below still receive the gesture in embedded webviews.
    }
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = pointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      if (!drag.active) {
        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
        if (distance < 5) return
        drag.active = true
        suppressClickRef.current = true
        setDraggedIndex(drag.index)
      }

      event.preventDefault()
      updateDropTarget(event.clientX, event.clientY, drag.index)
    }

    function handlePointerUp(event: PointerEvent) {
      const drag = pointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      if (drag.active) {
        const target = updateDropTarget(event.clientX, event.clientY, drag.index)
        if (target) onReorder(section.key, drag.index, target.index, target.position)
      }
      clearDragState()
      if (drag.active) window.setTimeout(() => { suppressClickRef.current = false }, 0)
    }

    function handlePointerCancel(event: PointerEvent) {
      const drag = pointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      suppressClickRef.current = false
      clearDragState()
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false })
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
    }
  }, [onReorder, section.key])

  function handleItemClick(itemIndex: number, hidden: boolean) {
    if (hidden) return
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    onSelect(section.key, itemIndex)
  }

  function handleItemKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return
    const target = items[index + (event.key === "ArrowUp" ? -1 : 1)]
    if (!target) return

    event.preventDefault()
    onReorder(section.key, index, target.index, event.key === "ArrowUp" ? "before" : "after")
  }

  return (
    <div className="resume-section-items-folder" id={id}>
      <div className="resume-section-items-header">
        <span>{items.length ? "Entries" : "No entries yet"}</span>
        <Button
          variant="ghost"
          size="sm"
          className="resume-section-add-item"
          onClick={() => onAdd(section.key)}
          aria-label={`Add entry to ${section.title}`}
          title={`Add entry to ${section.title}`}
        >
          <Plus aria-hidden="true" />
          Add entry
        </Button>
      </div>
      {items.length ? (
        <ol className={`resume-section-items-list ${draggedIndex !== null ? "is-dragging" : ""}`}>
          {items.map((item) => {
            const isDragging = draggedIndex === item.index
            const isDropTarget = dropTarget?.index === item.index
            const dropClass = isDropTarget ? `is-drop-${dropTarget.position}` : ""

            return (
              <li
                key={`${section.key}-${item.id}-${item.index}`}
                className={`${isDragging ? "is-dragging" : ""} ${dropClass}`.trim()}
                data-sidebar-item-index={item.index}
              >
                <Button
                  variant="ghost"
                  className={`resume-section-item-link ${item.hidden ? "is-hidden" : ""}`}
                  type="button"
                  onClick={() => handleItemClick(item.index, item.hidden)}
                  onKeyDown={(event) => { if (!item.hidden) handleItemKeyDown(event, item.index) }}
                  onPointerDown={item.hidden ? undefined : (event) => handlePointerDown(event, item.index)}
                  aria-label={`${item.title}${item.hidden ? " (hidden)" : ""}`}
                  aria-disabled={item.hidden}
                  title={item.hidden ? "Hidden from the resume" : "Click to jump to this entry; drag to reorder"}
                >
                  <span className="resume-section-drag-handle" aria-hidden="true"><GripVertical /></span>
                  <span className="resume-section-index">{String(item.index + 1).padStart(2, "0")}</span>
                  <span className="resume-section-link-copy">
                    <span className="resume-section-link-title">{item.title}</span>
                    <span className="resume-section-link-detail">{item.hidden ? "Hidden from resume" : item.detail}</span>
                  </span>
                </Button>
                <div className="resume-section-actions">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onToggleHidden(section.key, item.index, !item.hidden)}
                    aria-label={`${item.hidden ? "Show" : "Hide"} ${item.title}`}
                    title={`${item.hidden ? "Show" : "Hide"} ${item.title}`}
                  >
                    {item.hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRemove(section.key, item.index)}
                    aria-label={`Delete ${item.title}`}
                    title={`Delete ${item.title}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="resume-section-items-empty">Add an entry to start editing this section.</p>
      )}
    </div>
  )
}

function SectionColumnsPopover({
  section,
  onChange,
  onTextAlignmentChange,
  onPageAlignmentChange,
}: {
  section: ReturnType<typeof getResumeSectionEntries>[number]
  onChange: (columns: number) => void
  onTextAlignmentChange: (alignment: ResumeSectionAlignment) => void
  onPageAlignmentChange: (pageAlignment: ResumeSectionAlignment) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-expanded={open}
          aria-label={`Set ${section.title} columns and layout (currently ${section.columns} ${section.columns === 1 ? "column" : "columns"}, ${section.alignment} text aligned, ${section.pageAlignment} on page)`}
          title={`Set ${section.title} columns and layout`}
        >
          <Columns3 aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="resume-section-columns-popover" align="end" side="left">
        <PopoverTitle>Entry layout</PopoverTitle>
        <PopoverDescription>Choose how entries align within their grid and where that grid sits on the page.</PopoverDescription>
        <div className="resume-section-column-options" role="radiogroup" aria-label={`${section.title} entry columns`}>
          {Array.from({ length: MAX_RESUME_SECTION_COLUMNS }, (_, index) => index + 1).map((columns) => {
            const selected = section.columns === columns
            return (
              <button
                className={`resume-section-column-option ${selected ? "is-selected" : ""}`.trim()}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  onChange(columns)
                  setOpen(false)
                }}
                key={columns}
              >
                <span
                  className="resume-section-column-preview"
                  style={{ "--resume-column-count": columns } as CSSProperties}
                  aria-hidden="true"
                >
                  {Array.from({ length: columns }, (_, cell) => <i key={cell} />)}
                </span>
                <span>{columns} {columns === 1 ? "column" : "columns"}</span>
                {selected ? <Check aria-hidden="true" /> : null}
              </button>
            )
          })}
        </div>
        <SectionAlignmentOptions
          label="Text alignment"
          ariaLabel={`${section.title} text alignment`}
          value={section.alignment}
          onChange={(alignment) => {
            onTextAlignmentChange(alignment)
            setOpen(false)
          }}
        />
        <SectionAlignmentOptions
          label="Page alignment"
          ariaLabel={`${section.title} page alignment`}
          value={section.pageAlignment}
          onChange={(pageAlignment) => {
            onPageAlignmentChange(pageAlignment)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function SectionAlignmentOptions({
  label,
  ariaLabel,
  value,
  onChange,
}: {
  label: string
  ariaLabel: string
  value: ResumeSectionAlignment
  onChange: (alignment: ResumeSectionAlignment) => void
}) {
  return (
    <div className="resume-section-layout-group">
      <span className="resume-section-layout-label">{label}</span>
      <div className="resume-section-layout-options" role="radiogroup" aria-label={ariaLabel}>
        {RESUME_SECTION_ALIGNMENT_OPTIONS.map((option) => {
          const selected = value === option.value
          const Icon = option.icon
          return (
            <button
              className={`resume-section-layout-option ${selected ? "is-selected" : ""}`.trim()}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              key={option.value}
            >
              <Icon aria-hidden="true" />
              <span>{option.label}</span>
              {selected ? <Check aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ResumeSkeletons() {
  return <div className="resume-grid" aria-label="Loading resumes">{[0, 1, 2].map((item) => <div className="resume-card resume-card-skeleton" key={item}><div /><span /></div>)}</div>
}

function areResumeDataEqual(left: ResumeFile["data"], right: ResumeFile["data"]) {
  return left === right || JSON.stringify(left) === JSON.stringify(right)
}
