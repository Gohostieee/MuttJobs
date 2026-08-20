import { useEffect, useRef, useState } from "react"
import {
  Bold,
  Check,
  Italic,
  Link2,
  List,
  ListOrdered,
  Sparkles,
  Underline,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { sanitizeRichTextHtml } from "@/lib/rich-text"
import {
  captureResumeTextSelection,
  RESUME_SELECTION_ACTIONS,
  type ResumeSelectionAction,
  type ResumeTextSelection,
  type ResumeTextSelectionCandidate,
  type ResumeTextSelectionContext,
} from "@/lib/resume-selection"

export { sanitizeRichTextHtml } from "@/lib/rich-text"

export type RichTextEditorProps = {
  value: string
  onChange: (value: string) => void
  onDone: () => void
  onCancel: () => void
  placeholder?: string
  selectionContext?: ResumeTextSelectionContext
  selectionResetKey?: number
  onSelectionChange?: (selection: ResumeTextSelection | null) => void
  onSelectionAction?: (action: ResumeSelectionAction, selection: ResumeTextSelection) => void
  onSelectionRestoreChange?: (restore: (() => void) | null) => void
}

export function RichTextEditor({
  value,
  onChange,
  onDone,
  onCancel,
  placeholder = "Start writing...",
  selectionContext,
  selectionResetKey = 0,
  onSelectionChange,
  onSelectionAction,
  onSelectionRestoreChange,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const toolbarButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const savedRangeRef = useRef<Range | null>(null)
  const selectionCaptureRef = useRef(0)
  const [focused, setFocused] = useState(false)
  const [selectionCandidate, setSelectionCandidate] = useState<ResumeTextSelectionCandidate | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || focused) return
    const nextHtml = sanitizeRichTextHtml(value)
    if (editor.innerHTML !== nextHtml) editor.innerHTML = nextHtml
  }, [focused, value])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    placeCaretAtEnd(editor)
  }, [])

  useEffect(() => {
    selectionCaptureRef.current += 1
    savedRangeRef.current = null
    setSelectionCandidate(null)
    onSelectionChange?.(null)
    onSelectionRestoreChange?.(null)
  }, [selectionResetKey])

  function emitChange() {
    const editor = editorRef.current
    if (!editor) return
    clearSelection()
    onChange(sanitizeRichTextHtml(editor.innerHTML))
  }

  function runCommand(command: string, commandValue?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, commandValue)
    emitChange()
  }

  function addLink() {
    const url = window.prompt("Enter a link URL", "https://")
    if (!url) return
    runCommand("createLink", url)
  }

  function scheduleSelectionCapture() {
    if (!selectionContext) return
    const captureId = ++selectionCaptureRef.current
    window.setTimeout(() => {
      if (captureId !== selectionCaptureRef.current) return
      void captureSelection(captureId)
    }, 0)
  }

  async function captureSelection(captureId: number) {
    const editor = editorRef.current
    if (!editor || !selectionContext) return
    const candidate = await captureResumeTextSelection(editor, selectionContext)
    if (captureId !== selectionCaptureRef.current) return

    if (!candidate) {
      clearSelection()
      return
    }

    const selection = editor.ownerDocument.defaultView?.getSelection()
    savedRangeRef.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    onSelectionRestoreChange?.(() => restoreSelection())
    setSelectionCandidate(candidate)
    onSelectionChange?.(candidate.selection)
  }

  function clearSelection() {
    selectionCaptureRef.current += 1
    savedRangeRef.current = null
    setSelectionCandidate(null)
    onSelectionChange?.(null)
    onSelectionRestoreChange?.(null)
  }

  function restoreSelection() {
    const editor = editorRef.current
    const savedRange = savedRangeRef.current
    if (!editor || !savedRange) return
    const selection = editor.ownerDocument.defaultView?.getSelection()
    if (!selection) return

    editor.focus({ preventScroll: true })
    selection.removeAllRanges()
    selection.addRange(savedRange)
  }

  function dismissSelection({ restoreFocus = false, preserveRange = false } = {}) {
    if (restoreFocus) restoreSelection()
    selectionCaptureRef.current += 1
    setSelectionCandidate(null)
    if (!preserveRange) {
      savedRangeRef.current = null
      onSelectionChange?.(null)
      onSelectionRestoreChange?.(null)
    }
  }

  function handleSelectionAction(action: ResumeSelectionAction) {
    const selection = selectionCandidate?.selection
    if (!selection) return
    const definition = RESUME_SELECTION_ACTIONS.find((candidate) => candidate.id === action)
    dismissSelection({ preserveRange: true })
    onSelectionAction?.(action, selection)
    if (definition) {
      // Keep an accessible announcement in the editor while the workspace
      // opens the shared sidebar request.
      setSelectionStatus(`${definition.label} selected`)
    }
  }

  const [selectionStatus, setSelectionStatus] = useState("")

  return (
    <div className="resume-editor" onClick={(event) => event.stopPropagation()}>
      <div className="resume-editor-toolbar" role="toolbar" aria-label="Rich text formatting">
        <EditorButton label="Bold" onMouseDown={() => runCommand("bold")}><Bold /></EditorButton>
        <EditorButton label="Italic" onMouseDown={() => runCommand("italic")}><Italic /></EditorButton>
        <EditorButton label="Underline" onMouseDown={() => runCommand("underline")}><Underline /></EditorButton>
        <span className="resume-editor-divider" />
        <EditorButton label="Bulleted list" onMouseDown={() => runCommand("insertUnorderedList")}><List /></EditorButton>
        <EditorButton label="Numbered list" onMouseDown={() => runCommand("insertOrderedList")}><ListOrdered /></EditorButton>
        <EditorButton label="Add link" onMouseDown={addLink}><Link2 /></EditorButton>
        <div className="resume-editor-actions">
          <Button type="button" variant="ghost" size="sm" className="resume-editor-action resume-editor-cancel" onMouseDown={(event) => event.preventDefault()} onClick={onCancel} aria-label="Cancel editing">
            <X aria-hidden="true" />
            <span>Cancel</span>
          </Button>
          <Button type="button" size="sm" className="resume-editor-action resume-editor-done" onMouseDown={(event) => event.preventDefault()} onClick={onDone} aria-label="Done editing">
            <Check aria-hidden="true" />
            <span>Done</span>
          </Button>
        </div>
      </div>
      <div
        ref={editorRef}
        className="resume-editor-content"
        data-selection-editor-root="true"
        contentEditable
        data-placeholder={placeholder}
        role="textbox"
        aria-label="Edit text"
        aria-multiline="true"
        suppressContentEditableWarning
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          setFocused(false)
          if (event.relatedTarget instanceof Node && toolbarRef.current?.contains(event.relatedTarget)) return
          clearSelection()
        }}
        onInput={emitChange}
        onMouseUp={scheduleSelectionCapture}
        onKeyUp={scheduleSelectionCapture}
        onSelect={scheduleSelectionCapture}
        onKeyDown={(event) => {
          if (event.key === "Tab" && selectionCandidate) {
            event.preventDefault()
            toolbarButtonRefs.current[0]?.focus()
            return
          }
          if (event.key === "Escape") {
            event.preventDefault()
            if (selectionCandidate) {
              dismissSelection({ restoreFocus: true })
            } else {
              onCancel()
            }
            return
          }
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            onDone()
          }
        }}
        onPaste={(event) => {
          event.preventDefault()
          const html = event.clipboardData.getData("text/html")
          const text = event.clipboardData.getData("text/plain")
          document.execCommand("insertHTML", false, sanitizeRichTextHtml(html || text))
          emitChange()
        }}
      />
      {selectionCandidate ? (
        <SelectionActionToolbar
          candidate={selectionCandidate}
          toolbarRef={toolbarRef}
          buttonRefs={toolbarButtonRefs}
          onAction={handleSelectionAction}
          onDismiss={() => dismissSelection({ restoreFocus: true })}
        />
      ) : null}
      <span className="sr-only" aria-live="polite">{selectionStatus}</span>
    </div>
  )
}

function SelectionActionToolbar({
  candidate,
  toolbarRef,
  buttonRefs,
  onAction,
  onDismiss,
}: {
  candidate: ResumeTextSelectionCandidate
  toolbarRef: React.RefObject<HTMLDivElement | null>
  buttonRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>
  onAction: (action: ResumeSelectionAction) => void
  onDismiss: () => void
}) {
  const { geometry } = candidate
  const top = Math.max(4, geometry.top + geometry.height + 7)
  const left = Math.max(4, geometry.left)

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = buttonRefs.current.filter((button): button is HTMLButtonElement => Boolean(button))
    if (event.key === "Escape") {
      event.preventDefault()
      onDismiss()
      return
    }
    if (!buttons.length || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return

    event.preventDefault()
    const currentIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement))
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1
    buttons[(currentIndex + delta + buttons.length) % buttons.length]?.focus()
  }

  return (
    <div
      ref={toolbarRef}
      className="resume-selection-toolbar"
      role="toolbar"
      aria-label="Actions for selected resume text"
      style={{ top, left }}
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
    >
      {RESUME_SELECTION_ACTIONS.map((action, index) => (
        <Button
          type="button"
          variant={action.id === "custom" ? "default" : "ghost"}
          size="sm"
          className="resume-selection-action"
          key={action.id}
          ref={(element) => { buttonRefs.current[index] = element }}
          tabIndex={index === 0 ? 0 : -1}
          onClick={() => onAction(action.id)}
          aria-label={action.label}
          title={action.description}
        >
          {action.id === "custom" ? <Sparkles aria-hidden="true" /> : null}
          <span>{action.label}</span>
        </Button>
      ))}
    </div>
  )
}

function EditorButton({ label, onMouseDown, children }: { label: string; onMouseDown: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="resume-editor-tool"
      aria-label={label}
      title={label}
      onMouseDown={(event) => {
        event.preventDefault()
        onMouseDown()
      }}
    >
      {children}
    </Button>
  )
}

function placeCaretAtEnd(element: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}
