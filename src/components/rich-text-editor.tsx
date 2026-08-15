import { useEffect, useRef, useState } from "react"
import {
  Bold,
  Check,
  Italic,
  Link2,
  List,
  ListOrdered,
  Underline,
  X,
} from "lucide-react"

import { sanitizeRichTextHtml } from "@/lib/rich-text"

export { sanitizeRichTextHtml } from "@/lib/rich-text"

export type RichTextEditorProps = {
  value: string
  onChange: (value: string) => void
  onDone: () => void
  onCancel: () => void
  placeholder?: string
}

export function RichTextEditor({ value, onChange, onDone, onCancel, placeholder = "Start writing..." }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)

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

  function emitChange() {
    const editor = editorRef.current
    if (!editor) return
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
          <button type="button" className="resume-editor-action resume-editor-cancel" onMouseDown={(event) => event.preventDefault()} onClick={onCancel} aria-label="Cancel editing">
            <X aria-hidden="true" />
            <span>Cancel</span>
          </button>
          <button type="button" className="resume-editor-action resume-editor-done" onMouseDown={(event) => event.preventDefault()} onClick={onDone} aria-label="Done editing">
            <Check aria-hidden="true" />
            <span>Done</span>
          </button>
        </div>
      </div>
      <div
        ref={editorRef}
        className="resume-editor-content"
        contentEditable
        data-placeholder={placeholder}
        role="textbox"
        aria-label="Edit text"
        aria-multiline="true"
        suppressContentEditableWarning
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onInput={emitChange}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
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
    </div>
  )
}

function EditorButton({ label, onMouseDown, children }: { label: string; onMouseDown: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="resume-editor-tool"
      aria-label={label}
      title={label}
      onMouseDown={(event) => {
        event.preventDefault()
        onMouseDown()
      }}
    >
      {children}
    </button>
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
