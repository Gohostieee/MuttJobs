import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react"
import { save } from "@tauri-apps/plugin-dialog"
import { openPath } from "@tauri-apps/plugin-opener"
import {
  ArrowLeft,
  CircleCheck,
  FileDown,
  FileJson2,
  FolderOpen,
  Grid2X2,
  LoaderCircle,
  Maximize2,
  Minus,
  PanelLeftOpen,
  PanelRightOpen,
  Plus,
  Redo2,
  RefreshCw,
  Ruler,
  Search,
  Undo2,
} from "lucide-react"

import { ResumeAiSidebar } from "@/components/resume-ai-sidebar"
import { CoverLetterDocument, getCoverLetterPageWidth, type CoverLetterChangeMeta } from "@/components/cover-letter-document"
import { CoverLetterInspector } from "@/components/cover-letter-inspector"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { runCoverLetterAiJob } from "@/lib/cover-letter-ai"
import { createCoverLetter, getCoverLettersDirectory, loadCoverLetters, saveCoverLetter } from "@/lib/cover-letter-storage"
import type { CoverLetterData, CoverLetterFile } from "@/lib/cover-letter-types"
import type { ResumeSelectionAction, ResumeTextSelection } from "@/lib/resume-selection"
import { exportResumePdf } from "@/lib/resume-export"

const MIN_ZOOM = 0.1
const DEFAULT_AI_SIDEBAR_WIDTH = 368
const MIN_AI_SIDEBAR_WIDTH = 368
const MAX_AI_SIDEBAR_WIDTH = 520
const DEFAULT_SECTIONS_SIDEBAR_WIDTH = 352
const MIN_SECTIONS_SIDEBAR_WIDTH = 280
const MAX_SECTIONS_SIDEBAR_WIDTH = 520
const COVER_LETTER_AI_SUGGESTIONS = [
  "Tailor this letter to the job description",
  "Make the opening more compelling",
  "Make the middle paragraph more specific without inventing facts",
]

type TextEdit = {
  key: string
  before: CoverLetterData
  redoBefore: CoverLetterData[]
  changed: boolean
}

type SelectionActionRequest = {
  id: number
  action: ResumeSelectionAction
  selection: ResumeTextSelection
}

export function CoverLetterWorkspace({ onViewerChange }: { onViewerChange?: (open: boolean) => void }) {
  const [letters, setLetters] = useState<CoverLetterFile[]>([])
  const [selected, setSelected] = useState<CoverLetterFile | null>(null)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [letterName, setLetterName] = useState("")
  const [createError, setCreateError] = useState("")
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try { setLetters(await loadCoverLetters()) }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load cover letters.") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return letters
    return letters.filter((letter) => [letter.data.applicant.name, letter.data.recipient.company, letter.data.position.title, letter.fileName]
      .some((value) => value?.toLowerCase().includes(needle)))
  }, [letters, query])

  async function openFolder() {
    const directory = await getCoverLettersDirectory()
    if (directory) await openPath(directory)
  }

  async function createEmptyLetter() {
    const name = letterName.trim()
    if (!name || creating) return
    setCreating(true)
    setCreateError("")
    try {
      const letter = await createCoverLetter(name)
      setLetters((current) => [letter, ...current])
      setCreateDialogOpen(false)
      setLetterName("")
      onViewerChange?.(true)
      setSelected(letter)
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : "Could not create the cover letter.")
    } finally {
      setCreating(false)
    }
  }

  if (selected) {
    return <CoverLetterViewer file={selected} onBack={(updated) => {
      setLetters((current) => current.map((letter) => letter.id === updated.id ? updated : letter))
      onViewerChange?.(false)
      setSelected(null)
    }} />
  }

  return (
    <main className="resume-workspace cover-letter-workspace">
      <header className="resume-library-header">
        <div>
          <div className="resume-title-row"><FileJson2 aria-hidden="true" /><span>Cover letter library</span></div>
          <h1>Tailored, thoughtful, ready.</h1>
          <p>Build structured cover letters that stay easy to edit, validate, and tailor for every opportunity.</p>
        </div>
        <div className="resume-header-actions">
          <Button onClick={() => { setLetterName(""); setCreateError(""); setCreateDialogOpen(true) }}><Plus /> Create cover letter</Button>
          <Button variant="outline" onClick={() => void openFolder()}><FolderOpen /> Open folder</Button>
          <Button variant="outline" size="icon" onClick={() => void refresh()} aria-label="Refresh cover letters"><RefreshCw /></Button>
        </div>
      </header>

      <section className="resume-library-body">
        <div className="resume-toolbar">
          <InputGroup className="resume-search"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cover letters" aria-label="Search cover letters" /></InputGroup>
          <div className="resume-count"><Grid2X2 /> {filtered.length} {filtered.length === 1 ? "letter" : "letters"}</div>
        </div>
        {loading ? <LibrarySkeletons /> : null}
        {error ? <div className="resume-empty"><h2>Something went wrong</h2><p>{error}</p></div> : null}
        {!loading && !error && filtered.length ? <div className="resume-grid">{filtered.map((letter) => <CoverLetterCard key={letter.id} file={letter} onOpen={() => { onViewerChange?.(true); setSelected(letter) }} />)}</div> : null}
        {!loading && !error && !filtered.length ? <div className="resume-empty"><FileJson2 /><h2>{query ? "No matching cover letters" : "Your library is ready"}</h2><p>{query ? "Try a company, position, applicant, or file name." : "Create a structured cover letter to get started."}</p></div> : null}
      </section>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <form className="contents" onSubmit={(event) => { event.preventDefault(); void createEmptyLetter() }}>
            <DialogHeader><DialogTitle>Create a cover letter</DialogTitle><DialogDescription>Start a schema-valid letter using the applicant's name.</DialogDescription></DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="cover-letter-name">Applicant name</Label>
              <Input id="cover-letter-name" value={letterName} onChange={(event) => setLetterName(event.target.value)} placeholder="e.g. Jordan Lee" autoFocus disabled={creating} />
              {createError ? <p className="text-sm text-destructive" role="alert">{createError}</p> : null}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={creating}>Cancel</Button><Button type="submit" disabled={creating || !letterName.trim()}>{creating ? "Creating…" : "Create cover letter"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function CoverLetterCard({ file, onOpen }: { file: CoverLetterFile; onOpen: () => void }) {
  const title = file.data.position.title || file.data.recipient.company || file.fileName.replace(/\.json$/i, "")
  const subtitle = [file.data.recipient.company, file.data.applicant.name].filter(Boolean).join(" · ")
  const updated = file.updatedAt ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(file.updatedAt * 1000) : "Local preview"
  return (
    <Button variant="ghost" className="resume-card h-auto w-full p-0 font-normal" onClick={onOpen} aria-label={`Open ${title}`}>
      <div className="resume-card-preview" aria-hidden="true"><div className="resume-card-document cover-letter-card-document" style={{ width: getCoverLetterPageWidth(file.data) }}><CoverLetterDocument letter={file.data} compact /></div></div>
      <div className="resume-card-info"><div><h2>{title}</h2><p>{subtitle || `Updated ${updated}`}</p></div><span>View <span aria-hidden="true">↗</span></span></div>
    </Button>
  )
}

type CoverLetterViewerProps = {
  file: CoverLetterFile
  onBack: (file: CoverLetterFile) => void
  targetJobId?: number
  backLabel?: string
}

export function CoverLetterViewer({
  file,
  onBack,
  targetJobId,
  backLabel = "Back to cover letter library",
}: CoverLetterViewerProps) {
  const [currentFile, setCurrentFile] = useState(file)
  const [zoom, setZoom] = useState(0.78)
  const [showPageGuides, setShowPageGuides] = useState(false)
  const [aiSidebarOpen, setAiSidebarOpen] = useState(true)
  const [aiSidebarWidth, setAiSidebarWidth] = useState(DEFAULT_AI_SIDEBAR_WIDTH)
  const [isAiSidebarResizing, setIsAiSidebarResizing] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [inspectorWidth, setInspectorWidth] = useState(DEFAULT_SECTIONS_SIDEBAR_WIDTH)
  const [isInspectorResizing, setIsInspectorResizing] = useState(false)
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [saveError, setSaveError] = useState("")
  const [exportState, setExportState] = useState<"idle" | "exporting" | "exported" | "error">("idle")
  const [exportError, setExportError] = useState("")
  const [activeTextSelection, setActiveTextSelection] = useState<ResumeTextSelection | null>(null)
  const [selectionActionRequest, setSelectionActionRequest] = useState<SelectionActionRequest | null>(null)
  const [selectionResetKey, setSelectionResetKey] = useState(0)
  const [, setHistoryVersion] = useState(0)
  const [documentRevision, setDocumentRevision] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)
  const latestFileRef = useRef(file)
  const revisionRef = useRef(0)
  const persistedRevisionRef = useRef(0)
  const saveTimerRef = useRef<number | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const undoStackRef = useRef<CoverLetterData[]>([])
  const redoStackRef = useRef<CoverLetterData[]>([])
  const textEditRef = useRef<TextEdit | null>(null)
  const selectionRestoreRef = useRef<(() => void) | null>(null)
  const selectionRequestIdRef = useRef(0)
  const aiSidebarResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const inspectorResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const aiChatActivatedRef = useRef(false)
  const aiActivationPromiseRef = useRef<Promise<void> | null>(null)
  const aiChangeCountRef = useRef(0)

  const name = currentFile.data.position.title || currentFile.data.recipient.company || currentFile.fileName
  const pageWidth = getCoverLetterPageWidth(currentFile.data)

  const enqueueSave = useCallback((snapshot: CoverLetterFile, revision: number) => {
    const task = saveQueueRef.current.then(async () => {
      try {
        const saved = await saveCoverLetter(
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
          setSaveState("error")
          setSaveError(reason instanceof Error ? reason.message : "Could not save this cover letter.")
        }
        throw reason
      }
    })
    saveQueueRef.current = task.catch(() => undefined)
    return task
  }, [targetJobId])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void enqueueSave(latestFileRef.current, revisionRef.current)
    }, 300)
  }, [enqueueSave])

  const refreshHistoryControls = useCallback(() => setHistoryVersion((version) => version + 1), [])

  const applyCoverLetterData = useCallback((data: CoverLetterData) => {
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
    scheduleSave()
  }, [scheduleSave])

  const commitTextEdit = useCallback(() => {
    const edit = textEditRef.current
    if (!edit) return
    if (edit.changed && !areCoverLettersEqual(latestFileRef.current.data, edit.before)) undoStackRef.current.push(edit.before)
    textEditRef.current = null
    refreshHistoryControls()
  }, [refreshHistoryControls])

  const beginTextEdit = useCallback((key: string) => {
    if (textEditRef.current?.key === key) return
    if (textEditRef.current) commitTextEdit()
    textEditRef.current = { key, before: latestFileRef.current.data, redoBefore: [...redoStackRef.current], changed: false }
    refreshHistoryControls()
  }, [commitTextEdit, refreshHistoryControls])

  const finishTextEdit = useCallback(() => commitTextEdit(), [commitTextEdit])

  const cancelTextEdit = useCallback((key: string, data: CoverLetterData) => {
    const edit = textEditRef.current
    if (!edit || edit.key !== key) { applyCoverLetterData(data); return }
    textEditRef.current = null
    applyCoverLetterData(data)
    redoStackRef.current = edit.redoBefore
    refreshHistoryControls()
  }, [applyCoverLetterData, refreshHistoryControls])

  const handleCoverLetterChange = useCallback((data: CoverLetterData, meta?: CoverLetterChangeMeta) => {
    const previous = latestFileRef.current.data
    if (data === previous || areCoverLettersEqual(data, previous)) return
    const activeEdit = textEditRef.current
    if (activeEdit && meta?.kind === "text" && activeEdit.key === meta.key) {
      if (!activeEdit.changed) { activeEdit.changed = true; redoStackRef.current = []; refreshHistoryControls() }
      applyCoverLetterData(data)
      return
    }
    if (activeEdit) commitTextEdit()
    undoStackRef.current.push(previous)
    redoStackRef.current = []
    refreshHistoryControls()
    applyCoverLetterData(data)
  }, [applyCoverLetterData, commitTextEdit, refreshHistoryControls])

  const handleUndo = useCallback(() => {
    commitTextEdit()
    const previous = undoStackRef.current.pop()
    if (!previous) { refreshHistoryControls(); return }
    redoStackRef.current.push(latestFileRef.current.data)
    applyCoverLetterData(previous)
    setDocumentRevision((revision) => revision + 1)
    refreshHistoryControls()
  }, [applyCoverLetterData, commitTextEdit, refreshHistoryControls])

  const handleRedo = useCallback(() => {
    commitTextEdit()
    const next = redoStackRef.current.pop()
    if (!next) { refreshHistoryControls(); return }
    undoStackRef.current.push(latestFileRef.current.data)
    applyCoverLetterData(next)
    setDocumentRevision((revision) => revision + 1)
    refreshHistoryControls()
  }, [applyCoverLetterData, commitTextEdit, refreshHistoryControls])

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current !== null) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    while (revisionRef.current > persistedRevisionRef.current) {
      await enqueueSave(latestFileRef.current, revisionRef.current)
    }
    await saveQueueRef.current
  }, [enqueueSave])

  const activateAiChat = useCallback(() => {
    if (aiChatActivatedRef.current) return flushPendingSave()
    if (aiActivationPromiseRef.current) return aiActivationPromiseRef.current

    const activation = (async () => {
      commitTextEdit()
      await flushPendingSave()
      undoStackRef.current.push(latestFileRef.current.data)
      redoStackRef.current = []
      aiChatActivatedRef.current = true
      aiChangeCountRef.current = 0
      refreshHistoryControls()
    })()

    aiActivationPromiseRef.current = activation
    void activation.catch(() => {
      aiActivationPromiseRef.current = null
    })
    return activation
  }, [commitTextEdit, flushPendingSave, refreshHistoryControls])

  const handleAiApply = useCallback((data: CoverLetterData, changed: boolean) => {
    if (!changed || areCoverLettersEqual(latestFileRef.current.data, data)) return
    if (aiChangeCountRef.current === 0) applyCoverLetterData(data)
    else handleCoverLetterChange(data)
    aiChangeCountRef.current += 1
  }, [applyCoverLetterData, handleCoverLetterChange])

  const handleSelectionAction = useCallback((action: ResumeSelectionAction, selection: ResumeTextSelection) => {
    setActiveTextSelection(selection)
    selectionRequestIdRef.current += 1
    setSelectionActionRequest({ id: selectionRequestIdRef.current, action, selection })
    setAiSidebarOpen(true)
  }, [])

  const handleBack = useCallback(async () => {
    try { commitTextEdit(); await flushPendingSave(); onBack(latestFileRef.current) } catch { /* Keep editor open on save failure. */ }
  }, [commitTextEdit, flushPendingSave, onBack])

  const handleExport = useCallback(async () => {
    if (exportState === "exporting") return
    commitTextEdit()
    setExportState("exporting")
    setExportError("")
    try {
      await flushPendingSave()
      if (document.fonts?.ready) await document.fonts.ready
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

      const defaultName = `${pdfFileStem(latestFileRef.current.data.position.title || latestFileRef.current.data.recipient.company || latestFileRef.current.fileName)}.pdf`
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
      setExportError(reason instanceof Error ? reason.message : String(reason || "Could not export this cover letter."))
    }
  }, [commitTextEdit, exportState, flushPendingSave])

  const changeZoom = useCallback((factor: number) => setZoom((current) => Math.max(MIN_ZOOM, current * factor)), [])
  const fit = useCallback(() => {
    const width = viewportRef.current?.clientWidth ?? 1000
    setZoom(Math.max(MIN_ZOOM, (width - 96) / pageWidth))
  }, [pageWidth])

  const clampAiSidebarWidth = useCallback((width: number) => Math.min(MAX_AI_SIDEBAR_WIDTH, Math.max(MIN_AI_SIDEBAR_WIDTH, width)), [])
  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!aiSidebarOpen) return
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId)
    aiSidebarResizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: aiSidebarWidth }
    setIsAiSidebarResizing(true)
  }, [aiSidebarOpen, aiSidebarWidth])
  const moveResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = aiSidebarResizeRef.current
    if (resize?.pointerId === event.pointerId) setAiSidebarWidth(clampAiSidebarWidth(resize.startWidth + event.clientX - resize.startX))
  }, [clampAiSidebarWidth])
  const finishResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (aiSidebarResizeRef.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    aiSidebarResizeRef.current = null; setIsAiSidebarResizing(false)
  }, [])
  const resizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setAiSidebarWidth((width) => clampAiSidebarWidth(width + (event.key === "ArrowRight" ? step : -step))) }
    if (event.key === "Home" || event.key === "End") { event.preventDefault(); setAiSidebarWidth(event.key === "Home" ? MIN_AI_SIDEBAR_WIDTH : MAX_AI_SIDEBAR_WIDTH) }
  }, [clampAiSidebarWidth])

  const clampInspectorWidth = useCallback((width: number) => Math.min(MAX_SECTIONS_SIDEBAR_WIDTH, Math.max(MIN_SECTIONS_SIDEBAR_WIDTH, width)), [])
  const startInspectorResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!inspectorOpen) return
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId)
    inspectorResizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: inspectorWidth }
    setIsInspectorResizing(true)
  }, [inspectorOpen, inspectorWidth])
  const moveInspectorResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = inspectorResizeRef.current
    if (resize?.pointerId === event.pointerId) setInspectorWidth(clampInspectorWidth(resize.startWidth + resize.startX - event.clientX))
  }, [clampInspectorWidth])
  const finishInspectorResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (inspectorResizeRef.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    inspectorResizeRef.current = null; setIsInspectorResizing(false)
  }, [])
  const inspectorResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault()
      setInspectorWidth((width) => clampInspectorWidth(width + (event.key === "ArrowLeft" ? step : -step)))
      return
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      setInspectorWidth(event.key === "Home" ? MIN_SECTIONS_SIDEBAR_WIDTH : MAX_SECTIONS_SIDEBAR_WIDTH)
    }
  }, [clampInspectorWidth])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isEditableTarget(event.target)) void handleBack()
      if (isEditableTarget(event.target)) return
      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (modifier && key === "z") { event.preventDefault(); event.shiftKey ? handleRedo() : handleUndo(); return }
      if (modifier && key === "y") { event.preventDefault(); handleRedo(); return }
      if (modifier && ["+", "="].includes(event.key)) { event.preventDefault(); changeZoom(1.2) }
      if (modifier && event.key === "-") { event.preventDefault(); changeZoom(1 / 1.2) }
      if (modifier && event.key === "0") { event.preventDefault(); fit() }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [changeZoom, fit, handleBack, handleRedo, handleUndo])

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault(); changeZoom(event.deltaY < 0 ? 1.12 : 1 / 1.12)
  }

  const canUndo = undoStackRef.current.length > 0 || Boolean(textEditRef.current?.changed)
  const canRedo = redoStackRef.current.length > 0
  const viewerStyle = {
    "--resume-ai-sidebar-width": `min(${aiSidebarWidth}px, 84vw)`,
    "--resume-ai-sidebar-min-width": `${MIN_AI_SIDEBAR_WIDTH}px`,
    "--resume-sections-sidebar-size": `${inspectorWidth}px`,
  } as CSSProperties

  return (
    <main className={`resume-viewer cover-letter-viewer ${aiSidebarOpen ? "has-ai-sidebar" : "is-ai-sidebar-collapsed"} ${inspectorOpen ? "has-sections-sidebar" : "is-sections-sidebar-collapsed"} ${isAiSidebarResizing ? "is-ai-sidebar-resizing" : ""} ${isInspectorResizing ? "is-sections-sidebar-resizing" : ""}`} style={viewerStyle}>
      <header className="resume-viewer-header">
        <Button variant="ghost" size="icon" onClick={() => void handleBack()} aria-label={backLabel}><ArrowLeft /></Button>
        {!aiSidebarOpen ? <Button variant="ghost" size="sm" className="resume-ai-toggle" onClick={() => setAiSidebarOpen(true)}><PanelLeftOpen /><span>AI chat</span></Button> : null}
        <div className="resume-viewer-title"><h1>{name}</h1><p>{currentFile.fileName}</p></div>
        <div className="resume-viewer-actions">
          <div className={`resume-save-state is-${saveState}`} role="status" title={saveError || undefined}>{saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}</div>
          <div className="resume-history-actions" role="toolbar" aria-label="Cover letter history"><Button variant="ghost" size="icon-sm" onClick={handleUndo} disabled={!canUndo} aria-label="Undo last change"><Undo2 /></Button><Button variant="ghost" size="icon-sm" onClick={handleRedo} disabled={!canRedo} aria-label="Redo last change"><Redo2 /></Button></div>
          <div className="resume-viewer-hint">Ctrl + scroll to zoom</div>
          <Button
            variant="default"
            size="sm"
            onClick={() => void handleExport()}
            disabled={exportState === "exporting"}
            aria-describedby={exportError ? "cover-letter-export-status" : undefined}
            title="Export this cover letter as a PDF"
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
          {!inspectorOpen ? <Button variant="ghost" size="sm" onClick={() => setInspectorOpen(true)} aria-label="Show letter details"><PanelRightOpen /><span>Details</span></Button> : null}
        </div>
      </header>
      <div className="resume-viewer-content">
        <ResumeAiSidebar<CoverLetterData>
          resumePath={currentFile.path}
          documentLabel="cover letter"
          enableJobTargeting
          enableResumeTargeting
          targetJobId={targetJobId}
          suggestions={COVER_LETTER_AI_SUGGESTIONS}
          runJob={runCoverLetterAiJob}
          isOpen={aiSidebarOpen}
          onToggle={() => setAiSidebarOpen((open) => !open)}
          onActivate={activateAiChat}
          onApply={handleAiApply}
          textSelection={activeTextSelection}
          selectionActionRequest={selectionActionRequest}
          onClearTextSelection={() => { selectionRestoreRef.current?.(); selectionRestoreRef.current = null; setActiveTextSelection(null) }}
        />
        <div className="resume-ai-resize-handle" role="separator" tabIndex={aiSidebarOpen ? 0 : -1} aria-label="Resize AI assistant panel" aria-orientation="vertical" aria-valuemin={MIN_AI_SIDEBAR_WIDTH} aria-valuemax={MAX_AI_SIDEBAR_WIDTH} aria-valuenow={Math.round(aiSidebarWidth)} onKeyDown={resizeKeyDown} onPointerDown={startResize} onPointerMove={moveResize} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={() => { aiSidebarResizeRef.current = null; setIsAiSidebarResizing(false) }} />
        <div className="resume-sections-resize-handle" role="separator" tabIndex={inspectorOpen ? 0 : -1} aria-label="Resize cover letter details panel" aria-orientation="vertical" aria-valuemin={MIN_SECTIONS_SIDEBAR_WIDTH} aria-valuemax={MAX_SECTIONS_SIDEBAR_WIDTH} aria-valuenow={Math.round(inspectorWidth)} title="Drag to resize cover letter details" onKeyDown={inspectorResizeKeyDown} onPointerDown={startInspectorResize} onPointerMove={moveInspectorResize} onPointerUp={finishInspectorResize} onPointerCancel={finishInspectorResize} onLostPointerCapture={() => { inspectorResizeRef.current = null; setIsInspectorResizing(false) }} />
        <div className="resume-viewport" ref={viewportRef} onWheel={onWheel}>
          <div className="resume-zoom-stage" style={{ zoom, width: pageWidth } as CSSProperties}>
            <CoverLetterDocument
              key={documentRevision}
              letter={currentFile.data}
              showPageGuides={showPageGuides}
              onChange={handleCoverLetterChange}
              onEditStart={beginTextEdit}
              onEditEnd={finishTextEdit}
              onEditCancel={cancelTextEdit}
              onTextSelection={setActiveTextSelection}
              onSelectionAction={handleSelectionAction}
              onSelectionRestoreChange={(restore) => { selectionRestoreRef.current = restore }}
              selectionResetKey={selectionResetKey}
            />
          </div>
        </div>
        {inspectorOpen ? <CoverLetterInspector letter={currentFile.data} onChange={handleCoverLetterChange} onEditStart={beginTextEdit} onEditEnd={finishTextEdit} onToggle={() => setInspectorOpen(false)} /> : null}
      </div>
      <div className="resume-export-root cover-letter-export-root" aria-hidden="true">
        <CoverLetterDocument letter={currentFile.data} showPageGuides={false} paginate={false} />
      </div>
      {exportError ? <p id="cover-letter-export-status" className="resume-export-error" role="alert">{exportError}</p> : null}
      <div className="resume-zoom-controls" role="toolbar" aria-label="Cover letter zoom controls"><Button variant="ghost" size="icon" onClick={() => changeZoom(1 / 1.2)} aria-label="Zoom out"><Minus /></Button><output>{Math.round(zoom * 100)}%</output><Button variant="ghost" size="icon" onClick={() => changeZoom(1.2)} aria-label="Zoom in"><Plus /></Button><span className="resume-control-separator" /><Button variant="ghost" size="icon" onClick={fit} aria-label="Fit cover letter to width"><Maximize2 /></Button></div>
    </main>
  )
}

function LibrarySkeletons() {
  return <div className="resume-grid" aria-label="Loading cover letters">{[0, 1, 2].map((item) => <div className="resume-card resume-card-skeleton" key={item}><div /><span /></div>)}</div>
}

function areCoverLettersEqual(left: CoverLetterData, right: CoverLetterData) { return JSON.stringify(left) === JSON.stringify(right) }

function pdfFileStem(value: string) {
  const withoutExtension = value.replace(/\.json$/i, "")
  return withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "cover-letter"
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, [contenteditable='true'], [role='textbox']"))
}
