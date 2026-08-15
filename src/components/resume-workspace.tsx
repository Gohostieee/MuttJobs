import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from "react"
import { openPath } from "@tauri-apps/plugin-opener"
import {
  ArrowLeft,
  Eye,
  EyeOff,
  FileJson2,
  FolderOpen,
  Grid2X2,
  GripVertical,
  ListTree,
  Maximize2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react"

import {
  getResumePageWidth,
  getResumeSectionEntries,
  ResumeDocument,
  type ResumeChangeMeta,
  type ResumeSectionDropPosition,
} from "@/components/resume-document"
import { ResumeAiSidebar, type ResumeActivityEntry } from "@/components/resume-ai-sidebar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createResume, getResumesDirectory, loadResumes, saveResume } from "@/lib/resume-storage"
import { getResumeSectionOptions } from "@/lib/resume-sections"
import type { ResumeFile } from "@/lib/resume-types"

const MIN_ZOOM = 0.1

type ResumeTextEdit = {
  key: string
  before: ResumeFile["data"]
  redoBefore: ResumeFile["data"][]
  changed: boolean
}

export function ResumeWorkspace() {
  const [resumes, setResumes] = useState<ResumeFile[]>([])
  const [selected, setSelected] = useState<ResumeFile | null>(null)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [resumeName, setResumeName] = useState("")
  const [createError, setCreateError] = useState("")
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setResumes(await loadResumes())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load resumes.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return resumes
    return resumes.filter((resume) => [resume.data.basics?.name, resume.data.basics?.headline, resume.fileName]
      .some((value) => value?.toLowerCase().includes(needle)))
  }, [query, resumes])

  async function openFolder() {
    const directory = await getResumesDirectory()
    if (directory) await openPath(directory)
  }

  function openCreateDialog() {
    setResumeName("")
    setCreateError("")
    setCreateDialogOpen(true)
  }

  async function createEmptyResume() {
    const name = resumeName.trim()
    if (!name || creating) return

    setCreating(true)
    setCreateError("")
    try {
      const resume = await createResume(name)
      setResumes((current) => [resume, ...current])
      setCreateDialogOpen(false)
      setResumeName("")
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
          setResumes((current) => current.map((resume) => resume.id === updatedFile.id ? updatedFile : resume))
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
          <label className="resume-search">
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resumes" aria-label="Search resumes" />
          </label>
          <div className="resume-count"><Grid2X2 aria-hidden="true" /> {filtered.length} {filtered.length === 1 ? "resume" : "resumes"}</div>
        </div>

        {loading ? <ResumeSkeletons /> : null}
        {error ? <div className="resume-empty"><h2>Something went wrong</h2><p>{error}</p></div> : null}
        {!loading && !error && filtered.length ? (
          <div className="resume-grid">
            {filtered.map((resume) => <ResumeCard key={resume.id} file={resume} onOpen={() => setSelected(resume)} />)}
          </div>
        ) : null}
        {!loading && !error && !filtered.length ? (
          <div className="resume-empty">
            <FileJson2 aria-hidden="true" />
            <h2>{query ? "No matching resumes" : "Your library is ready"}</h2>
            <p>{query ? "Try a name or file name." : "Add a JSON resume to the resume folder, then refresh."}</p>
          </div>
        ) : null}
      </section>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              void createEmptyResume()
            }}
          >
            <DialogHeader>
              <DialogTitle>Create a resume</DialogTitle>
              <DialogDescription>Choose a name for your new empty resume.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="resume-name">Name</Label>
              <Input
                id="resume-name"
                value={resumeName}
                onChange={(event) => setResumeName(event.target.value)}
                placeholder="e.g. Product designer"
                autoFocus
                disabled={creating}
              />
              {createError ? <p className="text-sm text-destructive" role="alert">{createError}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !resumeName.trim()}>
                {creating ? "Creating..." : "Create resume"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}

function ResumeCard({ file, onOpen }: { file: ResumeFile; onOpen: () => void }) {
  const name = file.data.basics?.name || file.fileName.replace(/\.json$/i, "")
  const updated = file.updatedAt ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(file.updatedAt * 1000) : "Local preview"
  return (
    <button className="resume-card" onClick={onOpen} aria-label={`Open ${name}`}>
      <div className="resume-card-preview" aria-hidden="true">
        <div className="resume-card-document"><ResumeDocument resume={file.data} compact /></div>
      </div>
      <div className="resume-card-info">
        <div><h2>{name}</h2><p>Updated {updated}</p></div>
        <span>View <span aria-hidden="true">↗</span></span>
      </div>
    </button>
  )
}

function ResumeViewer({ file, onBack }: { file: ResumeFile; onBack: (file: ResumeFile) => void }) {
  const [currentFile, setCurrentFile] = useState(file)
  const [zoom, setZoom] = useState(0.78)
  const [aiSidebarOpen, setAiSidebarOpen] = useState(true)
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [saveError, setSaveError] = useState("")
  const [activityHistory, setActivityHistory] = useState<ResumeActivityEntry[]>([])
  const [, setHistoryVersion] = useState(0)
  const [documentRevision, setDocumentRevision] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)
  const latestFileRef = useRef(file)
  const revisionRef = useRef(0)
  const persistedRevisionRef = useRef(0)
  const saveTimerRef = useRef<number | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const undoStackRef = useRef<ResumeFile["data"][]>([])
  const redoStackRef = useRef<ResumeFile["data"][]>([])
  const textEditRef = useRef<ResumeTextEdit | null>(null)
  const aiChatActivatedRef = useRef(false)
  const aiActivationPromiseRef = useRef<Promise<void> | null>(null)
  const aiChangeCountRef = useRef(0)
  const name = currentFile.data.basics?.name || currentFile.fileName
  const pageWidth = getResumePageWidth(currentFile.data)

  const enqueueSave = useCallback((snapshot: ResumeFile, revision: number) => {
    const task = saveQueueRef.current.then(async () => {
      try {
        const saved = await saveResume(snapshot, snapshot.data)
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
          setSaveError(reason instanceof Error ? reason.message : "Could not save this resume.")
        }
        throw reason
      }
    })
    saveQueueRef.current = task.catch(() => undefined)
    return task
  }, [])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void enqueueSave(latestFileRef.current, revisionRef.current)
    }, 300)
  }, [enqueueSave])

  const refreshHistoryControls = useCallback(() => {
    setHistoryVersion((version) => version + 1)
  }, [])

  const applyResumeData = useCallback((data: ResumeFile["data"]) => {
    if (data === latestFileRef.current.data) return
    const nextFile = { ...latestFileRef.current, data }
    latestFileRef.current = nextFile
    revisionRef.current += 1
    setCurrentFile(nextFile)
    setSaveState("saving")
    setSaveError("")
    scheduleSave()
  }, [scheduleSave])

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

  const handleResumeChange = useCallback((data: ResumeFile["data"], meta?: ResumeChangeMeta) => {
    const previousData = latestFileRef.current.data
    if (data === previousData) return

    const activeTextEdit = textEditRef.current
    if (activeTextEdit && meta?.kind === "text" && activeTextEdit.key === meta.key) {
      if (!activeTextEdit.changed) {
        activeTextEdit.changed = true
        redoStackRef.current = []
        refreshHistoryControls()
      }
      applyResumeData(data)
      return
    }

    if (activeTextEdit) commitTextEdit()
    undoStackRef.current.push(previousData)
    redoStackRef.current = []
    refreshHistoryControls()
    applyResumeData(data)

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
    if (revisionRef.current > persistedRevisionRef.current) {
      await enqueueSave(latestFileRef.current, revisionRef.current)
    } else {
      await saveQueueRef.current
    }
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
      setActivityHistory((current) => [
        {
          id: `ai-checkpoint-${Date.now()}`,
          label: "Checkpoint saved",
          detail: "Before your first AI request",
          createdAt: Date.now(),
        },
        ...current,
      ])
      refreshHistoryControls()
    })()

    aiActivationPromiseRef.current = activation
    void activation.catch(() => {
      aiActivationPromiseRef.current = null
    })
    return activation
  }, [commitTextEdit, flushPendingSave, refreshHistoryControls])

  const handleAiApply = useCallback((data: ResumeFile["data"], response: string, changed: boolean) => {
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

    const detail = response.replace(/\s+/g, " ").trim().slice(0, 120)
    setActivityHistory((current) => [
      {
        id: `ai-activity-${Date.now()}-${aiChangeCountRef.current}`,
        label: didChange ? "AI updated resume" : "AI reviewed resume",
        detail: detail || (didChange ? "Changes saved to the resume JSON" : "No changes were needed"),
        createdAt: Date.now(),
      },
      ...current,
    ])
  }, [applyResumeData, handleResumeChange])

  const handleBack = useCallback(async () => {
    try {
      await flushPendingSave()
      onBack(latestFileRef.current)
    } catch {
      // Keep the editor open when the final save fails so the user can retry.
    }
  }, [flushPendingSave, onBack])

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

  return (
    <main className={`resume-viewer ${aiSidebarOpen ? "has-ai-sidebar" : "is-ai-sidebar-collapsed"}`}>
      <header className="resume-viewer-header">
        <Button variant="ghost" size="icon" onClick={() => void handleBack()} aria-label="Back to resume library"><ArrowLeft /></Button>
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
            variant="ghost"
            size="sm"
            className="resume-ai-toggle"
            onClick={() => setAiSidebarOpen((open) => !open)}
            aria-label={aiSidebarOpen ? "Hide AI assistant" : "Show AI assistant"}
            aria-controls="resume-ai-sidebar"
            aria-expanded={aiSidebarOpen}
            title={aiSidebarOpen ? "Hide AI assistant" : "Show AI assistant"}
          >
            {aiSidebarOpen ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
            <span>AI chat</span>
          </Button>
        </div>
      </header>
      <div className="resume-viewer-content">
        {aiSidebarOpen ? (
          <ResumeAiSidebar
            fileName={currentFile.fileName}
            resumePath={currentFile.path}
            activityHistory={activityHistory}
            canUndo={canUndo}
            onActivate={activateAiChat}
            onApply={handleAiApply}
            onUndo={handleUndo}
          />
        ) : null}
        <div className="resume-viewport" ref={viewportRef} onWheel={onWheel}>
          <div className="resume-zoom-stage" style={{ ...zoomStyle, width: pageWidth }}>
            <ResumeDocument
              key={documentRevision}
              resume={currentFile.data}
              onChange={handleResumeChange}
              onEditStart={beginTextEdit}
              onEditEnd={finishTextEdit}
              onEditCancel={cancelTextEdit}
            />
          </div>
        </div>
      </div>
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

export function ResumeSectionsSidebar({
  resume,
  sections,
  onSelect,
  onReorder,
  onAdd,
  onRemove,
  onToggleHidden,
}: {
  resume: ResumeFile["data"]
  sections: ReturnType<typeof getResumeSectionEntries>
  onSelect: (sectionId: string) => void
  onReorder: (sourceKey: string, targetKey: string, position: ResumeSectionDropPosition) => void
  onAdd: (key: string) => void
  onRemove: (key: string) => void
  onToggleHidden: (key: string, hidden: boolean) => void
}) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
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

              return (
                <li
                  key={section.key}
                  className={`${isDragging ? "is-dragging" : ""} ${dropClass}`.trim()}
                  data-section-key={section.key}
                >
                  <button
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
                      <span className="resume-section-link-title">{section.title}</span>
                      <span className="resume-section-link-detail">{section.hidden ? "Hidden from resume" : section.detail}</span>
                    </span>
                  </button>
                  <div className="resume-section-actions">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onToggleHidden(section.key, !section.hidden)}
                      aria-label={`${section.hidden ? "Show" : "Hide"} ${section.title}`}
                      title={`${section.hidden ? "Show" : "Hide"} ${section.title}`}
                    >
                      {section.hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
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
                </li>
              )
            })}
          </ol>
        </nav>
      ) : (
        <p className="resume-sections-empty">No visible sections in this resume.</p>
      )}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="resume-section-dialog">
          <DialogHeader>
            <DialogTitle>Add a section</DialogTitle>
            <DialogDescription>Choose a section from the resume schema to add to this document. Hidden sections stay in the outline so they can be shown directly.</DialogDescription>
          </DialogHeader>
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
                      onAdd(section.key)
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

function ResumeSkeletons() {
  return <div className="resume-grid" aria-label="Loading resumes">{[0, 1, 2].map((item) => <div className="resume-card resume-card-skeleton" key={item}><div /><span /></div>)}</div>
}

function areResumeDataEqual(left: ResumeFile["data"], right: ResumeFile["data"]) {
  return left === right || JSON.stringify(left) === JSON.stringify(right)
}
