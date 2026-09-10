import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { WorkspaceHeader } from "@/components/workspace-layout"
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react"
import { openPath } from "@tauri-apps/plugin-opener"
import { save } from "@tauri-apps/plugin-dialog"
import {
  ArrowLeft,
  FileText,
  Grid2X2,
  RefreshCw,
  Search,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  CircleCheck,
  ChevronDown,
  ChevronRight,
  Columns3,
  Eye,
  EyeOff,
  FileDown,
  FolderOpen,
  Folder,
  GripVertical,
  ListTree,
  LoaderCircle,
  Maximize2,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Ruler,
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
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { getResumesDirectory, loadResumes, saveResume } from "@/lib/resume-storage"
import { exportResumePdf } from "@/lib/resume-export"
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ResumeTargetsPanel } from "@/components/resume-targets-panel"
import "./resume-targets-panel.css"

const MIN_ZOOM = 0.1
const DEFAULT_SECTIONS_SIDEBAR_WIDTH = 320
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

export function ResumeWorkspace({ onViewerChange }: { onViewerChange?: (open: boolean) => void }) {
  const [files, setFiles] = useState<ResumeFile[]>([])
  const [selected, setSelected] = useState<ResumeFile | null>(null)
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [folderError, setFolderError] = useState("")
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try { setFiles(await loadResumes()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load resumes.") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return files.filter(file => !needle || [file.fileName, file.data.basics.name, file.data.basics.headline]
      .some(value => value.toLowerCase().includes(needle)))
  }, [files, query])

  async function openFolder() {
    setFolderError("")
    try {
      const directory = await getResumesDirectory()
      if (!directory) throw new Error("The resume folder is available in the desktop app.")
      await openPath(directory)
    } catch (cause) {
      setFolderError(cause instanceof Error ? cause.message : "Could not open the resume folder.")
    }
  }

  if (selected) return <ResumeViewer key={selected.path} file={selected} onBack={updated => {
    setFiles(items => items.map(item => item.path === updated.path ? updated : item))
    setSelected(null); onViewerChange?.(false)
  }} />

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <WorkspaceHeader title="Resumes" description="Choose a saved resume to edit, refine, and check against your job targets." actions={<>
          <Button variant="outline" onClick={() => void openFolder()}><FolderOpen data-icon="inline-start" />Open folder</Button>
          <Button variant="outline" size="icon" disabled={loading} onClick={() => void refresh()} aria-label="Refresh resumes"><RefreshCw /></Button>
        </>} />
      <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6" aria-label="Saved resumes" aria-busy={loading}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <InputGroup className="w-full max-w-md"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput value={query} onChange={event => setQuery(event.target.value)} placeholder="Search resumes" aria-label="Search resumes" /></InputGroup>
          <div className="resume-count" role="status"><Grid2X2 aria-hidden="true" />{loading ? "Loading resumes..." : `${filtered.length} ${filtered.length === 1 ? "resume" : "resumes"}`}</div>
        </div>
        {folderError ? <Alert className="mb-4" variant="destructive"><AlertTitle>Could not open folder</AlertTitle><AlertDescription>{folderError}</AlertDescription></Alert> : null}
        {loading ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">{[0, 1, 2].map(index => <Skeleton className="h-[29rem]" key={index} />)}</div> : null}
        {error ? <Alert variant="destructive"><AlertTitle>Could not load resumes</AlertTitle><AlertDescription>{error}</AlertDescription><Button variant="outline" className="mt-3 w-fit" onClick={() => void refresh()}>Try again</Button></Alert> : null}
        {!loading && !error && filtered.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(file => <ResumeCard key={file.path} file={file} onOpen={() => { setSelected(file); onViewerChange?.(true) }} />)}</div> : null}
        {!loading && !error && !filtered.length ? (
          <Empty className="min-h-88 border">
            <EmptyHeader><EmptyMedia variant="icon"><FileText /></EmptyMedia><EmptyTitle>{query.trim() ? "No matching resumes" : "Your library is ready"}</EmptyTitle><EmptyDescription>{query.trim() ? "Try a name, headline, or file name." : "Create a resume in Job Workspace. Your saved resumes will appear here."}</EmptyDescription></EmptyHeader>
            {query.trim() ? <Button variant="outline" onClick={() => setQuery("")}>Clear search</Button> : null}
          </Empty>
        ) : null}
      </section>
    </main>
  )
}

function ResumeCard({ file, onOpen }: { file: ResumeFile; onOpen: () => void }) {
  const title = file.fileName.replace(/\.json$/i, "")
  const subtitle = [file.data.basics.name, file.data.basics.headline].filter(Boolean).join(" \u00b7 ")
  const updated = file.updatedAt ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(file.updatedAt * 1000) : "Local preview"
  return (
    <Card className="overflow-hidden">
      <CardContent className="px-0"><div className="resume-card-preview" aria-hidden="true" inert><div className="resume-card-document" style={{ width: getResumePageWidth(file.data) }}><ResumeDocument resume={file.data} compact /></div></div></CardContent>
      <CardHeader><CardTitle className="truncate" title={title}>{title}</CardTitle><CardDescription className="truncate" title={subtitle}>{subtitle || updated}</CardDescription></CardHeader>
      <CardFooter><Button variant="outline" onClick={onOpen} aria-label={"Open " + title}>Open resume</Button></CardFooter>
    </Card>
  )
}

type ResumeViewerProps = {
  file: ResumeFile
  onBack: (file: ResumeFile) => void
  targetJobId?: number
  backLabel?: string
}

export function ResumeViewer({
  file,
  onBack,
  targetJobId,
  backLabel = "Back to resume library",
}: ResumeViewerProps) {
  const [currentFile, setCurrentFile] = useState(file)
  const [zoom, setZoom] = useState(0.78)
  const [showPageGuides, setShowPageGuides] = useState(false)
  const [rightTab, setRightTab] = useState("sections")
  const [sectionsSidebarOpen, setSectionsSidebarOpen] = useState(true)
  const [sectionsSidebarWidth, setSectionsSidebarWidth] = useState(DEFAULT_SECTIONS_SIDEBAR_WIDTH)
  const [isSectionsSidebarResizing, setIsSectionsSidebarResizing] = useState(false)
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [saveError, setSaveError] = useState("")
  const [exportState, setExportState] = useState<"idle" | "exporting" | "exported" | "error">("idle")
  const [exportError, setExportError] = useState("")
  const [, setHistoryVersion] = useState(0)
  const [documentRevision, setDocumentRevision] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)
  const latestFileRef = useRef(file)
  const artifactRevisionRef = useRef(file.revision)
  const revisionRef = useRef(0)
  const persistedRevisionRef = useRef(0)
  const queuedSaveRevisionRef = useRef(0)
  const saveTimerRef = useRef<number | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const undoStackRef = useRef<ResumeFile["data"][]>([])
  const redoStackRef = useRef<ResumeFile["data"][]>([])
  const textEditRef = useRef<ResumeTextEdit | null>(null)
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
          { ...snapshot, revision: artifactRevisionRef.current },
          snapshot.data,
          targetJobId === undefined ? undefined : { jobId: targetJobId },
        )
        artifactRevisionRef.current = saved.revision
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
      if (event.defaultPrevented || document.querySelector('[role="dialog"], [role="menu"]')) return
      if (event.key === "Escape" && !textEditRef.current) void handleBack()
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
    "--resume-sections-sidebar-size": `${sectionsSidebarWidth}px`,
  } as CSSProperties

  return (
    <main className={`resume-viewer is-ai-sidebar-collapsed ${sectionsSidebarOpen ? "has-sections-sidebar" : "is-sections-sidebar-collapsed"}  ${isSectionsSidebarResizing ? "is-sections-sidebar-resizing" : ""}`.trim()} style={viewerStyle}>
      <header className="resume-viewer-header">
        <Button variant="ghost" size="icon" onClick={() => void handleBack()} aria-label={backLabel}><ArrowLeft /></Button>
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
            />
          </div>
        </div>
        {sectionsSidebarOpen ? (
          <Tabs value={rightTab} onValueChange={setRightTab} className="resume-right-panel">
            <div className="resume-right-tabs"><TabsList variant="line" aria-label="Resume sidebar"><TabsTrigger value="sections">Sections</TabsTrigger><TabsTrigger value="targets">Targets</TabsTrigger></TabsList>
              <Button variant="ghost" size="icon-sm" aria-label="Hide resume sidebar" onClick={() => setSectionsSidebarOpen(false)}><PanelRightClose /></Button>
            </div>
            <TabsContent value="targets" forceMount hidden={rightTab !== "targets"} className="resume-right-content">
              <ResumeTargetsPanel file={currentFile} targetJobId={targetJobId} dirty={saveState !== "saved"} beforeRun={async () => { commitTextEdit(); await flushPendingSave(); return latestFileRef.current }} />
            </TabsContent>
            <TabsContent value="sections" forceMount hidden={rightTab !== "sections"} className="resume-right-content">
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
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
      <div className="resume-export-root" aria-hidden="true">
        <ResumeDocument resume={currentFile.data} showPageGuides={false} renderPageSurfaces={false} />
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
                      className={`resume-section-link grid h-auto min-w-0 justify-start gap-2 px-2 py-2.5 whitespace-normal ${section.hidden ? "is-hidden" : ""}`}
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
                  className={`resume-section-item-link grid h-auto min-w-0 justify-start gap-1 px-1 py-2 whitespace-normal ${item.hidden ? "is-hidden" : ""}`}
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

function areResumeDataEqual(left: ResumeFile["data"], right: ResumeFile["data"]) {
  return left === right || JSON.stringify(left) === JSON.stringify(right)
}
