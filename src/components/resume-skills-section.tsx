import { useEffect, useRef, useState } from "react"
import { AnimatePresence, Reorder, useDragControls } from "motion/react"
import {
  Code2,
  Copy,
  EllipsisVertical,
  Eye,
  EyeOff,
  FolderGit2,
  GripVertical,
  Heart,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import {
  getResumeSection,
  removeResumeSectionItem,
  setResumeSectionItemHidden,
  setResumeSectionItems,
  updateResumeSectionItem,
} from "@/lib/resume-sections"
import type { AnyResumeItem, ResumeData, SkillItem } from "@/lib/resume-types"

const SKILL_ICON_OPTIONS = [
  { value: "code", label: "Code", icon: Code2 },
  { value: "sparkles", label: "Sparkles", icon: Sparkles },
  { value: "star", label: "Star", icon: Star },
  { value: "folder", label: "Folder", icon: FolderGit2 },
  { value: "heart", label: "Heart", icon: Heart },
] as const

type ResumeSkillsSectionProps = {
  resume: ResumeData
  sectionKey: string
  sectionTitle: string
  onChange: (resume: ResumeData) => void
}

type SkillEditorState = {
  item: SkillItem
  mode: "create" | "update"
}

export function ResumeSkillsSection({ resume, sectionKey, sectionTitle, onChange }: ResumeSkillsSectionProps) {
  const items = getSkillItems(resume, sectionKey)
  const [editor, setEditor] = useState<SkillEditorState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SkillItem | null>(null)

  function updateItems(nextItems: SkillItem[]) {
    onChange(setResumeSectionItems(resume, sectionKey, nextItems))
  }

  function handleAdd() {
    setEditor({ item: createSkillItem(), mode: "create" })
  }

  function handleEdit(item: SkillItem) {
    setEditor({ item: { ...item, keywords: [...item.keywords] }, mode: "update" })
  }

  function handleDuplicate(item: SkillItem) {
    const duplicate = { ...item, id: createSkillItemId(), keywords: [...item.keywords] }
    setEditor({ item: duplicate, mode: "create" })
  }

  function handleDelete() {
    if (!pendingDelete) return
    const item = pendingDelete
    const index = items.findIndex((candidate) => candidate.id === item.id)
    if (index === -1) return
    onChange(removeResumeSectionItem(resume, sectionKey, index))
    if (editor?.item.id === item.id) setEditor(null)
    setPendingDelete(null)
  }

  function handleToggleHidden(item: SkillItem) {
    const index = items.findIndex((candidate) => candidate.id === item.id)
    if (index === -1) return
    onChange(setResumeSectionItemHidden(resume, sectionKey, index, !item.hidden))
  }

  function handleSave(item: SkillItem) {
    const index = items.findIndex((candidate) => candidate.id === item.id)
    if (index === -1) {
      onChange(setResumeSectionItems(resume, sectionKey, [...items, { ...item, keywords: [...item.keywords] }]))
    } else {
      onChange(updateResumeSectionItem(resume, sectionKey, index, () => ({ ...item, keywords: [...item.keywords] })))
    }
    setEditor(null)
  }

  return (
    <div className={`resume-skills-section ${items.length === 0 ? "is-empty" : ""}`}>
      <Reorder.Group
        axis="y"
        values={items}
        onReorder={updateItems}
        className="resume-skills-list"
        as="ol"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((item) => (
            <SkillRow
              key={item.id}
              item={item}
              onEdit={() => handleEdit(item)}
              onDuplicate={() => handleDuplicate(item)}
              onDelete={() => setPendingDelete(item)}
              onToggleHidden={() => handleToggleHidden(item)}
            />
          ))}
        </AnimatePresence>
      </Reorder.Group>

      <Button type="button" variant="ghost" className="resume-skills-add" onClick={handleAdd}>
        <Plus aria-hidden="true" />
        Add a new skill
      </Button>

      <SkillEditorDialog
        editor={editor}
        sectionTitle={sectionTitle}
        onClose={() => setEditor(null)}
        onSave={handleSave}
      />

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this skill?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name || "This skill"} will be removed from the resume. You can still undo the change from resume history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SkillRow({
  item,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleHidden,
}: {
  item: SkillItem
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onToggleHidden: () => void
}) {
  const controls = useDragControls()

  return (
    <Reorder.Item
      value={item}
      as="li"
      dragListener={false}
      dragControls={controls}
      className={`resume-skill-row ${item.hidden ? "is-hidden" : ""}`}
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: item.hidden ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <div
        className="resume-skill-drag-handle"
        aria-hidden="true"
        title="Drag to reorder"
        onPointerDown={(event) => {
          event.preventDefault()
          controls.start(event)
        }}
      >
        <GripVertical />
      </div>

      <button type="button" className="resume-skill-row-main" onClick={onEdit}>
        <span className="resume-skill-row-title">{item.name || "Untitled skill"}</span>
        {item.proficiency ? <span className="resume-skill-row-subtitle">{item.proficiency}</span> : null}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="resume-skill-row-options"
            aria-label={`Options for ${item.name || "skill"}`}
            title="Options"
          >
            <EllipsisVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onToggleHidden}>
            {item.hidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
            {item.hidden ? "Show" : "Hide"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onEdit}>
            <Pencil aria-hidden="true" />
            Update
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy aria-hidden="true" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Reorder.Item>
  )
}

function SkillEditorDialog({
  editor,
  sectionTitle,
  onClose,
  onSave,
}: {
  editor: SkillEditorState | null
  sectionTitle: string
  onClose: () => void
  onSave: (item: SkillItem) => void
}) {
  const [draft, setDraft] = useState<SkillItem | null>(editor?.item ?? null)

  useEffect(() => {
    setDraft(editor?.item ?? null)
  }, [editor])

  const open = editor !== null && draft !== null

  function updateDraft(update: (item: SkillItem) => SkillItem) {
    setDraft((current) => current ? update(current) : current)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    const name = draft.name.trim()
    if (!name) return
    onSave({
      ...draft,
      name,
      proficiency: draft.proficiency.trim(),
      level: Math.min(5, Math.max(0, Math.round(draft.level))),
      keywords: draft.keywords.map((keyword) => keyword.trim()).filter(Boolean),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogContent className="resume-skill-dialog">
        <form className="resume-skill-form" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editor?.mode === "create" ? <Plus aria-hidden="true" /> : <Pencil aria-hidden="true" />}
              {editor?.mode === "create" ? "Create a new skill" : "Update an existing skill"}
            </DialogTitle>
            <DialogDescription>
              Edit the skill category, proficiency, level, and searchable keywords used by this resume.
              {sectionTitle ? ` Section: ${sectionTitle}.` : ""}
            </DialogDescription>
          </DialogHeader>

          {draft ? (
            <>
              <div className="resume-skill-name-row">
                <SkillIconPicker
                  value={draft.icon}
                  onChange={(icon) => updateDraft((item) => ({ ...item, icon }))}
                />
                <div className="grid min-w-0 flex-1 gap-2">
                  <Label htmlFor="resume-skill-name">Name</Label>
                  <Input
                    id="resume-skill-name"
                    value={draft.name}
                    onChange={(event) => {
                      const name = event.currentTarget.value
                      updateDraft((item) => ({ ...item, name }))
                    }}
                    autoFocus
                    required
                  />
                </div>
                <SkillColorPicker
                  value={draft.iconColor}
                  onChange={(iconColor) => updateDraft((item) => ({ ...item, iconColor }))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="resume-skill-proficiency">Proficiency</Label>
                <Input
                  id="resume-skill-proficiency"
                  value={draft.proficiency}
                  onChange={(event) => {
                    const proficiency = event.currentTarget.value
                    updateDraft((item) => ({ ...item, proficiency }))
                  }}
                  placeholder="Beginner, Intermediate, Advanced..."
                />
              </div>

              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="resume-skill-level">Level</Label>
                  <span className="text-xs text-muted-foreground">
                    {draft.level === 0 ? "Hidden" : `${draft.level} / 5`}
                  </span>
                </div>
                <Slider
                  id="resume-skill-level"
                  min={0}
                  max={5}
                  step={1}
                  value={[draft.level]}
                  onValueChange={(value) => updateDraft((item) => ({ ...item, level: value[0] ?? 0 }))}
                  aria-label="Skill level"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="resume-skill-keywords">Keywords</Label>
                <SkillChipInput
                  id="resume-skill-keywords"
                  value={draft.keywords}
                  onChange={(keywords) => updateDraft((item) => ({ ...item, keywords }))}
                />
              </div>
            </>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">{editor?.mode === "create" ? "Create" : "Save Changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SkillIconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const current = SKILL_ICON_OPTIONS.find((option) => option.value === value) ?? SKILL_ICON_OPTIONS[0]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon-lg" className="mt-5" aria-label="Choose skill icon" title="Choose skill icon">
          <current.icon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="resume-skill-icon-popover">
        <p className="text-xs font-medium text-muted-foreground">Icon</p>
        <div className="resume-skill-icon-options">
          {SKILL_ICON_OPTIONS.map((option) => {
            const Icon = option.icon
            const selected = option.value === value
            return (
              <Button
                key={option.value}
                type="button"
                variant={selected ? "secondary" : "ghost"}
                size="icon"
                className="resume-skill-icon-option"
                onClick={() => { onChange(option.value); setOpen(false) }}
                aria-label={option.label}
                title={option.label}
              >
                <Icon aria-hidden="true" />
              </Button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SkillColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const color = isHexColor(value) ? value : "#64748b"

  return (
    <div className="resume-skill-color-picker" title="Choose icon color">
      <span className="sr-only">Icon color</span>
      <span className="resume-skill-color-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
      <input
        type="color"
        value={color}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-label="Choose icon color"
      />
      {value ? (
        <button type="button" className="resume-skill-color-clear" onClick={(event) => { event.preventDefault(); onChange("") }} aria-label="Use automatic icon color">
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

function SkillChipInput({ id, value, onChange }: { id: string; value: string[]; onChange: (value: string[]) => void }) {
  const [input, setInput] = useState("")
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingIndex !== null && editingIndex >= value.length) setEditingIndex(null)
  }, [editingIndex, value.length])

  useEffect(() => {
    if (editingIndex !== null) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editingIndex])

  function addChips(next: string[]) {
    const trimmed = next.map((chip) => chip.trim()).filter(Boolean)
    if (!trimmed.length) return
    onChange(Array.from(new Set([...value, ...trimmed])))
  }

  function updateChip(index: number, nextValue: string) {
    const trimmed = nextValue.trim()
    if (!trimmed || index < 0 || index >= value.length) return
    if (value.some((chip, chipIndex) => chipIndex !== index && chip === trimmed)) return
    onChange(value.map((chip, chipIndex) => chipIndex === index ? trimmed : chip))
  }

  function removeChip(index: number) {
    onChange(value.filter((_, chipIndex) => chipIndex !== index))
    setEditingIndex((current) => {
      if (current === index) return null
      if (current !== null && current > index) return current - 1
      return current
    })
    if (editingIndex === index) setInput("")
  }

  function handleInputChange(nextValue: string) {
    if (editingIndex !== null) {
      if (nextValue.includes(",")) {
        updateChip(editingIndex, nextValue.replace(",", ""))
        setEditingIndex(null)
        setInput("")
      } else {
        setInput(nextValue)
      }
      return
    }

    if (nextValue.includes(",")) {
      const parts = nextValue.split(",")
      addChips(parts.slice(0, -1))
      setInput(parts[parts.length - 1] ?? "")
    } else {
      setInput(nextValue)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault()
      if (editingIndex !== null) {
        if (input.trim()) updateChip(editingIndex, input)
        setEditingIndex(null)
        setInput("")
      } else if (input.trim()) {
        addChips([input])
        setInput("")
      }
    } else if (event.key === "Escape" && editingIndex !== null) {
      setEditingIndex(null)
      setInput("")
    }
  }

  return (
    <div className="resume-skill-chips">
      <Reorder.Group axis="x" values={value} onReorder={onChange} className="resume-skill-chip-list" as="div">
        <AnimatePresence initial={false} mode="popLayout">
          {value.map((chip, index) => (
            <Reorder.Item key={chip} value={chip} as="div" layout className="resume-skill-chip">
              <Badge variant="outline" className={editingIndex === index ? "is-editing" : ""}>
                <span className="resume-skill-chip-text">{chip}</span>
                <button
                  type="button"
                  className="resume-skill-chip-action"
                  onClick={() => { setEditingIndex(index); setInput(chip) }}
                  aria-label={`Edit ${chip}`}
                  title={`Edit ${chip}`}
                >
                  <Pencil aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="resume-skill-chip-action is-delete"
                  onClick={() => removeChip(index)}
                  aria-label={`Remove ${chip}`}
                  title={`Remove ${chip}`}
                >
                  <X aria-hidden="true" />
                </button>
              </Badge>
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>
      <Input
        ref={inputRef}
        id={id}
        value={input}
        autoComplete="off"
        aria-label={editingIndex === null ? "Add keyword" : "Edit keyword"}
        placeholder={editingIndex === null ? "Add a keyword..." : "Editing keyword..."}
        onChange={(event) => handleInputChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <p className="resume-skill-chip-help">Press Enter or comma to add or save a keyword.</p>
    </div>
  )
}

function getSkillItems(resume: ResumeData, sectionKey: string): SkillItem[] {
  return (getResumeSection(resume, sectionKey)?.items ?? []).filter(isSkillItem)
}

function isSkillItem(item: AnyResumeItem): item is SkillItem {
  return "proficiency" in item && "keywords" in item && "level" in item
}

function createSkillItemId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `skills-item-${crypto.randomUUID()}`
  return `skills-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createSkillItem(): SkillItem {
  return {
    id: createSkillItemId(),
    hidden: false,
    icon: "code",
    iconColor: "",
    name: "",
    proficiency: "",
    level: 0,
    keywords: [],
  }
}

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value)
}
