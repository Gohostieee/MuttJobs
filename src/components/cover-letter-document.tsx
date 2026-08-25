import { Check, X } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { RichTextEditor } from "@/components/rich-text-editor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { loadGoogleFonts } from "@/lib/google-fonts"
import { sanitizeRichTextHtml } from "@/lib/rich-text"
import type { CoverLetterAddress, CoverLetterData } from "@/lib/cover-letter-types"
import type {
  ResumeSelectionAction,
  ResumeTextSelection,
  ResumeTextSelectionContext,
} from "@/lib/resume-selection"

export const COVER_LETTER_PAGE_WIDTH = 816
export const COVER_LETTER_PAGE_HEIGHT = 1056

export type CoverLetterChangeMeta = { kind: "text"; key: string }

type Path = Array<string | number>

type CoverLetterDocumentProps = {
  letter: CoverLetterData
  compact?: boolean
  showPageGuides?: boolean
  paginate?: boolean
  onChange?: (letter: CoverLetterData, meta?: CoverLetterChangeMeta) => void
  onEditStart?: (key: string) => void
  onEditEnd?: () => void
  onEditCancel?: (key: string, letter: CoverLetterData) => void
  onTextSelection?: (selection: ResumeTextSelection | null) => void
  onSelectionAction?: (action: ResumeSelectionAction, selection: ResumeTextSelection) => void
  onSelectionRestoreChange?: (restore: (() => void) | null) => void
  selectionResetKey?: number
}

type EditContext = {
  activeKey: string | null
  begin: (key: string) => void
  finish: () => void
  cancel: (path: Path, value: unknown) => void
  update: (path: Path, value: unknown) => void
  reportSelection: (selection: ResumeTextSelection | null) => void
  runSelectionAction: (action: ResumeSelectionAction, selection: ResumeTextSelection) => void
  reportSelectionRestore: (restore: (() => void) | null) => void
  selectionResetKey: number
}

type CoverLetterPageBreakDetail = {
  page: number
  crossingSections: string[]
}

export function CoverLetterDocument({
  letter,
  compact = false,
  showPageGuides,
  paginate = true,
  onChange,
  onEditStart,
  onEditEnd,
  onEditCancel,
  onTextSelection,
  onSelectionAction,
  onSelectionRestoreChange,
  selectionResetKey = 0,
}: CoverLetterDocumentProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(1)
  const [pageBreakDetails, setPageBreakDetails] = useState<CoverLetterPageBreakDetail[]>([])
  const documentRef = useRef<HTMLElement>(null)
  const pageGuidesVisible = !compact && showPageGuides !== false
  const pageWidth = getCoverLetterPageWidth(letter)
  const pageHeight = getCoverLetterPageHeight(letter)
  const pageMarginY = letter.metadata.page.marginY * 3.78
  const { body, heading } = letter.metadata.typography
  const bodyWeight = body.fontWeights[0] ?? "400"
  const bodyItalicWeight = body.fontWeights[1] ?? bodyWeight
  const bodyBoldWeight = body.fontWeights[2] ?? "700"
  const headingWeight = heading.fontWeights[0] ?? "700"
  const bodyFontWeightsKey = body.fontWeights.join(",")
  const headingFontWeightsKey = heading.fontWeights.join(",")

  useEffect(() => {
    loadGoogleFonts([
      { family: body.fontFamily, weights: body.fontWeights },
      { family: heading.fontFamily || body.fontFamily, weights: heading.fontWeights },
    ])
  }, [body.fontFamily, bodyFontWeightsKey, heading.fontFamily, headingFontWeightsKey])

  useLayoutEffect(() => {
    const element = documentRef.current
    if (!element) {
      setPageCount(1)
      setPageBreakDetails([])
      return
    }

    if (compact || !paginate) {
      clearCoverLetterPagination(element)
      setPageCount(1)
      setPageBreakDetails([])
      return
    }

    let frame: number | null = null
    const updatePageMetrics = () => {
      clearCoverLetterPagination(element)
      applyCoverLetterPagination(element, pageHeight, pageWidth, pageMarginY)
      const nextPageCount = Math.max(1, Math.ceil(element.scrollHeight / pageHeight))
      const nextPageBreakDetails = pageGuidesVisible
        ? getCoverLetterPageBreakDetails(element, pageHeight, pageWidth, pageMarginY, nextPageCount)
        : []
      setPageCount((current) => current === nextPageCount ? current : nextPageCount)
      setPageBreakDetails((current) => arePageBreakDetailsEqual(current, nextPageBreakDetails) ? current : nextPageBreakDetails)
    }
    const measurePages = () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = null
        updatePageMetrics()
      })
    }

    updatePageMetrics()
    measurePages()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measurePages)
    observer?.observe(element)

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame)
      observer?.disconnect()
      clearCoverLetterPagination(element)
    }
  }, [compact, letter, pageGuidesVisible, pageHeight, pageMarginY, pageWidth, paginate])

  const style = {
    "--resume-page-width": `${pageWidth}px`,
    "--resume-page-height": `${pageHeight}px`,
    "--resume-margin-x": `${letter.metadata.page.marginX * 3.78}px`,
    "--resume-margin-y": `${pageMarginY}px`,
    "--cover-letter-body-font": body.fontFamily,
    "--cover-letter-body-size": `${body.fontSize}pt`,
    "--cover-letter-body-leading": body.lineHeight,
    "--cover-letter-body-weight": bodyWeight,
    "--cover-letter-body-italic-weight": bodyItalicWeight,
    "--cover-letter-body-bold-weight": bodyBoldWeight,
    "--cover-letter-heading-font": heading.fontFamily || body.fontFamily,
    "--cover-letter-heading-size": `${heading.fontSize}pt`,
    "--cover-letter-heading-leading": heading.lineHeight,
    "--cover-letter-heading-weight": headingWeight,
  } as CSSProperties

  const context: EditContext | undefined = onChange ? {
    activeKey,
    begin(key) {
      setActiveKey(key)
      onEditStart?.(key)
    },
    finish() {
      setActiveKey(null)
      onEditEnd?.()
    },
    cancel(path, value) {
      const restored = updateAtPath(letter, path, value)
      setActiveKey(null)
      onEditCancel?.(pathKey(path), restored)
    },
    update(path, value) {
      onChange(updateAtPath(letter, path, value), { kind: "text", key: pathKey(path) })
    },
    reportSelection: (selection) => onTextSelection?.(selection),
    runSelectionAction: (action, selection) => onSelectionAction?.(action, selection),
    reportSelectionRestore: (restore) => onSelectionRestoreChange?.(restore),
    selectionResetKey,
  } : undefined

  const contact = [letter.applicant.email, letter.applicant.phone].filter(Boolean).join(" · ")
  const hasRecipientDetails = Boolean(
    letter.recipient.name
    || letter.recipient.title
    || letter.recipient.company
    || addressLines(letter.recipient.address).length,
  )

  return (
    <article
      ref={documentRef}
      className={`cover-letter-document${compact ? " is-compact" : ""}`}
      data-format={letter.metadata.page.format}
      data-page-count={pageCount}
      data-page-guides={pageGuidesVisible ? "visible" : "hidden"}
      style={style}
      aria-label={`Cover letter for ${letter.position.title || "an open position"}`}
    >
      {pageHeight && !compact && paginate ? (
        <div className="resume-page-guides resume-page-surfaces" aria-hidden="true">
          {Array.from({ length: pageCount }, (_, index) => (
            <div
              className={`resume-page-surface${index === pageCount - 1 ? " is-last-page" : ""}`}
              key={`cover-letter-page-surface-${index + 1}`}
              style={{ top: `${pageHeight * index}px` }}
            />
          ))}
        </div>
      ) : null}
      {pageHeight && pageGuidesVisible ? (
        <div className="resume-page-guides resume-page-margin-overlays" aria-hidden="true">
          {Array.from({ length: pageCount }, (_, index) => (
            <div
              className="resume-page-margin-overlay"
              key={`cover-letter-page-margin-overlay-${index + 1}`}
              style={{ top: `${pageHeight * index}px` }}
            />
          ))}
        </div>
      ) : null}
      {pageHeight && pageGuidesVisible ? (
        <div className="resume-page-guides resume-page-guide-labels" aria-hidden="true">
          {Array.from({ length: pageCount }, (_, index) => (
            <span
              className="resume-page-surface-label"
              key={`cover-letter-page-label-${index + 1}`}
              style={{ top: `${pageHeight * index + Math.max(8, pageMarginY)}px` }}
            >
              Page {index + 1}
            </span>
          ))}
        </div>
      ) : null}
      {pageHeight && pageGuidesVisible ? (
        <div className="resume-page-guides resume-page-breaks" aria-hidden="true">
          {pageBreakDetails.map((pageBreak) => (
            <div
              className={`resume-page-break${pageBreak.crossingSections.length ? " is-content-cut" : ""}`}
              data-crossing-sections={pageBreak.crossingSections.length || undefined}
              key={`cover-letter-page-break-${pageBreak.page}`}
              style={{ top: `${pageHeight * pageBreak.page}px` }}
            >
              <span className="resume-page-break-label">
                <strong>Page {pageBreak.page + 1}</strong>
                <span>
                  {pageBreak.crossingSections.length
                    ? `Cut through ${formatCoverLetterPageBreakSections(pageBreak.crossingSections)}`
                    : "Clean page boundary"}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <header className="cover-letter-masthead" id="cover-letter-applicant">
        <EditableText context={context} path={["applicant", "name"]} value={letter.applicant.name} as="h1" placeholder="Your name" />
        <div className="cover-letter-contact-line">
          {contact || context ? <EditableText context={context} path={["applicant", "email"]} value={letter.applicant.email || ""} placeholder="Email address" /> : null}
          {letter.applicant.phone || context ? <EditableText context={context} path={["applicant", "phone"]} value={letter.applicant.phone || ""} placeholder="Phone number" /> : null}
        </div>
        <EditableAddress context={context} prefix={["applicant", "address"]} address={letter.applicant.address} label="Your address" inline />
      </header>

      <div className="cover-letter-date" id="cover-letter-metadata">
        <EditableText context={context} path={["metadata", "date"]} value={letter.metadata.date} placeholder="Date" />
      </div>

      {context || hasRecipientDetails ? (
        <section className="cover-letter-recipient" id="cover-letter-recipient">
          <EditableText context={context} path={["recipient", "name"]} value={letter.recipient.name || ""} placeholder="Hiring manager name" />
          <EditableText context={context} path={["recipient", "title"]} value={letter.recipient.title || ""} placeholder="Hiring manager title" />
          <EditableText context={context} path={["recipient", "company"]} value={letter.recipient.company} placeholder="Company" />
          <EditableAddress context={context} prefix={["recipient", "address"]} address={letter.recipient.address} label="Recipient address" />
        </section>
      ) : null}

      <section className="cover-letter-content" id="cover-letter-content">
        <EditableText context={context} path={["recipient", "salutation"]} value={letter.recipient.salutation || ""} as="p" className="cover-letter-salutation" placeholder="Dear Hiring Manager:" />
        <EditableText context={context} path={["content", "opening"]} value={letter.content.opening} as="p" block placeholder="Write an opening paragraph…" selectionContext={{ fieldPath: ["content", "opening"], sectionKey: "opening" }} />
        {letter.content.body.map((paragraph, index) => (
          <EditableText
            key={`body-${index}`}
            context={context}
            path={["content", "body", index]}
            value={paragraph}
            as="p"
            block
            placeholder={`Write body paragraph ${index + 1}…`}
            selectionContext={{ fieldPath: ["content", "body", index], sectionKey: "body", itemId: `body-${index}` }}
          />
        ))}
        <EditableText context={context} path={["content", "closingParagraph"]} value={letter.content.closingParagraph} as="p" block placeholder="Write a closing paragraph…" selectionContext={{ fieldPath: ["content", "closingParagraph"], sectionKey: "closing" }} />
      </section>

      <footer className="cover-letter-closing" id="cover-letter-closing">
        <EditableText context={context} path={["closing", "signOff"]} value={letter.closing.signOff} as="p" placeholder="Sincerely," />
        <EditableText context={context} path={["closing", "name"]} value={letter.closing.name} as="p" className="cover-letter-signature" placeholder="Your name" />
      </footer>
    </article>
  )
}

const ADDRESS_FIELDS: Array<{ key: keyof CoverLetterAddress; label: string }> = [
  { key: "street", label: "Street address" },
  { key: "street2", label: "Apartment, suite, etc." },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postalCode", label: "Postal code" },
  { key: "country", label: "Country" },
]

function EditableAddress({
  context,
  prefix,
  address,
  label,
  inline = false,
}: {
  context?: EditContext
  prefix: Path
  address?: CoverLetterAddress
  label: string
  inline?: boolean
}) {
  const key = pathKey(prefix)
  const editing = context?.activeKey === key
  const initialAddressRef = useRef<CoverLetterAddress | undefined>(address ? structuredClone(address) : undefined)
  const wasEditingRef = useRef(false)
  const lines = addressLines(address)
  const hasAddress = lines.length > 0

  if (editing && !wasEditingRef.current) initialAddressRef.current = address ? structuredClone(address) : undefined
  wasEditingRef.current = editing

  if (editing && context) {
    return (
      <div className="cover-letter-address-editor" aria-label={`Edit ${label}`} onClick={(event) => event.stopPropagation()}>
        <div className="cover-letter-address-editor-grid">
          {ADDRESS_FIELDS.map((field) => (
            <label key={field.key} className={`cover-letter-address-field-${field.key}`}>
              <span>{field.label}</span>
              <Input
                value={address?.[field.key] ?? ""}
                onChange={(event) => context.update([...prefix, field.key], event.target.value || null)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault()
                    context.cancel(prefix, initialAddressRef.current)
                  }
                }}
                autoFocus={field.key === "street"}
              />
            </label>
          ))}
        </div>
        <div className="cover-letter-address-editor-actions">
          <Button type="button" variant="ghost" size="sm" onClick={() => context.cancel(prefix, initialAddressRef.current)}>
            <X aria-hidden="true" />
            <span>Cancel</span>
          </Button>
          <Button type="button" size="sm" onClick={context.finish}>
            <Check aria-hidden="true" />
            <span>Done</span>
          </Button>
        </div>
      </div>
    )
  }

  if (!hasAddress && !context) return null

  return (
    <div
      className={`cover-letter-address${context ? " resume-editable-text" : ""}`}
      data-editable={context ? "true" : undefined}
      role={context ? "button" : undefined}
      tabIndex={context ? 0 : undefined}
      aria-label={context && !hasAddress ? label : undefined}
      title={context ? `Click to edit ${label.toLowerCase()}` : undefined}
      onClick={context ? (event) => {
        event.preventDefault()
        event.stopPropagation()
        initialAddressRef.current = address ? structuredClone(address) : undefined
        context.begin(key)
      } : undefined}
      onKeyDown={context ? (event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        initialAddressRef.current = address ? structuredClone(address) : undefined
        context.begin(key)
      } : undefined}
    >
      {hasAddress
        ? inline
          ? <p>{lines.join(", ")}</p>
          : lines.map((line, index) => <p key={`${key}-${index}`}>{line}</p>)
        : <p className="resume-editable-placeholder">{label}</p>}
    </div>
  )
}

function EditableText({
  context,
  path,
  value,
  as: Element = "span",
  className,
  placeholder,
  block = false,
  selectionContext,
}: {
  context?: EditContext
  path: Path
  value: string
  as?: "span" | "p" | "h1"
  className?: string
  placeholder: string
  block?: boolean
  selectionContext?: ResumeTextSelectionContext
}) {
  const key = pathKey(path)
  const initialValueRef = useRef(value)
  const editing = context?.activeKey === key
  const visible = Boolean(stripHtml(value))

  if (editing) {
    return (
      <div className="resume-editable-field is-editing">
        <RichTextEditor
          value={value}
          onChange={(next) => context.update(path, next)}
          onDone={context.finish}
          onCancel={() => context.cancel(path, initialValueRef.current)}
          placeholder={placeholder}
          selectionContext={selectionContext}
          selectionResetKey={context.selectionResetKey}
          onSelectionChange={context.reportSelection}
          onSelectionAction={context.runSelectionAction}
          onSelectionRestoreChange={context.reportSelectionRestore}
        />
      </div>
    )
  }

  if (!visible && !context) return null
  const content: ReactNode = visible
    ? <span dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(value) }} />
    : <span className="resume-editable-placeholder">{placeholder}</span>

  return (
    <div className={`resume-editable-field${block ? " cover-letter-paragraph-field" : ""}`}>
      <Element
        className={`${className || ""}${context ? " resume-editable-text" : ""}`.trim() || undefined}
        onClick={context ? (event) => {
          event.preventDefault()
          event.stopPropagation()
          initialValueRef.current = value
          context.begin(key)
        } : undefined}
        title={context ? "Click to edit" : undefined}
      >
        {content}
      </Element>
    </div>
  )
}

function updateAtPath(letter: CoverLetterData, path: Path, value: unknown): CoverLetterData {
  const next = structuredClone(letter) as unknown as Record<string, unknown>
  let cursor: unknown = next
  for (let index = 0; index < path.length - 1; index += 1) {
    cursor = Array.isArray(cursor)
      ? cursor[path[index] as number]
      : (cursor as Record<string, unknown>)[path[index] as string]
  }
  const last = path[path.length - 1]
  if (Array.isArray(cursor)) cursor[last as number] = value
  else (cursor as Record<string, unknown>)[last as string] = value
  return next as unknown as CoverLetterData
}

function pathKey(path: Path) {
  return path.map(String).join(".")
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim()
}

export function getCoverLetterPageWidth(letter: CoverLetterData) {
  return letter.metadata.page.format === "a4" ? 794 : COVER_LETTER_PAGE_WIDTH
}

export function getCoverLetterPageHeight(letter: CoverLetterData) {
  return letter.metadata.page.format === "a4" ? 1123 : COVER_LETTER_PAGE_HEIGHT
}

function addressLines(address: CoverLetterAddress | undefined) {
  if (!address) return []
  const locality = [address.city, address.state, address.postalCode].filter(Boolean).join(", ").replace(", ", ", ")
  return [address.street, address.street2, locality, address.country].filter((value): value is string => Boolean(value))
}

type CoverLetterPaginationCandidate = {
  anchor: HTMLElement
  extent: HTMLElement
  canSplit: boolean
}

const COVER_LETTER_PAGINATION_EPSILON = 0.5
const COVER_LETTER_PAGINATION_ATTRIBUTE = "data-resume-pagination-break"
const COVER_LETTER_PAGINATION_SPACE = "--resume-pagination-space"

function clearCoverLetterPagination(element: HTMLElement) {
  element.querySelectorAll<HTMLElement>(`[${COVER_LETTER_PAGINATION_ATTRIBUTE}]`).forEach((node) => {
    node.removeAttribute(COVER_LETTER_PAGINATION_ATTRIBUTE)
    node.style.removeProperty(COVER_LETTER_PAGINATION_SPACE)
  })
}

function applyCoverLetterPagination(element: HTMLElement, pageHeight: number, pageWidth: number, pageMarginY: number) {
  const usableHeight = pageHeight - pageMarginY * 2
  if (usableHeight <= COVER_LETTER_PAGINATION_EPSILON) return

  const documentRect = element.getBoundingClientRect()
  const scale = documentRect.width > 0 && pageWidth > 0 ? documentRect.width / pageWidth : 1
  getCoverLetterPaginationCandidates(element).forEach((candidate) => {
    applyCoverLetterPaginationCandidate(candidate, documentRect, scale, pageHeight, pageMarginY, usableHeight)
  })
}

function getCoverLetterPaginationCandidates(element: HTMLElement): CoverLetterPaginationCandidate[] {
  const blocks = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement && [
    "cover-letter-masthead",
    "cover-letter-date",
    "cover-letter-recipient",
    "cover-letter-content",
    "cover-letter-closing",
  ].some((className) => child.classList.contains(className)))

  const candidates: CoverLetterPaginationCandidate[] = []
  blocks.forEach((block) => {
    if (!block.classList.contains("cover-letter-content")) {
      candidates.push({ anchor: block, extent: block, canSplit: false })
      return
    }

    const paragraphs = Array.from(block.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("resume-editable-field"))
    if (paragraphs.length) {
      paragraphs.forEach((paragraph) => candidates.push({ anchor: paragraph, extent: paragraph, canSplit: true }))
    } else {
      candidates.push({ anchor: block, extent: block, canSplit: true })
    }
  })
  return candidates
}

function getCoverLetterContentBlocks(container: HTMLElement): HTMLElement[] {
  return Array.from(container.children).filter((child): child is HTMLElement => child instanceof HTMLElement && [
    "P",
    "UL",
    "OL",
    "DIV",
  ].includes(child.tagName)).flatMap((child) => {
    if (child.tagName === "UL" || child.tagName === "OL") {
      return Array.from(child.children).filter((item): item is HTMLElement => item instanceof HTMLElement && item.tagName === "LI")
    }
    return [child]
  })
}

function applyCoverLetterPaginationCandidate(
  candidate: CoverLetterPaginationCandidate,
  documentRect: DOMRect,
  scale: number,
  pageHeight: number,
  pageMarginY: number,
  usableHeight: number,
) {
  const anchorRect = candidate.anchor.getBoundingClientRect()
  const extentRect = candidate.extent.getBoundingClientRect()
  if (!anchorRect.height && !extentRect.height) return

  const top = (anchorRect.top - documentRect.top) / scale
  const bottom = (extentRect.bottom - documentRect.top) / scale
  const candidateHeight = bottom - top

  if (candidate.canSplit && candidateHeight > usableHeight + COVER_LETTER_PAGINATION_EPSILON) {
    const nestedCandidates = getCoverLetterContentBlocks(candidate.anchor).map((block) => ({ anchor: block, extent: block, canSplit: true }))
    if (nestedCandidates.length && !(nestedCandidates.length === 1 && nestedCandidates[0].anchor === candidate.anchor && nestedCandidates[0].extent === candidate.extent)) {
      nestedCandidates.forEach((nestedCandidate) => {
        applyCoverLetterPaginationCandidate(nestedCandidate, documentRect, scale, pageHeight, pageMarginY, usableHeight)
      })
    }
    return
  }

  const pageIndex = Math.max(0, Math.floor(Math.max(0, top) / pageHeight))
  const pageStart = pageIndex * pageHeight + pageMarginY
  const pageEnd = (pageIndex + 1) * pageHeight - pageMarginY
  let space = 0

  if (top < pageStart - COVER_LETTER_PAGINATION_EPSILON) {
    space = pageStart - top
  } else if (bottom > pageEnd + COVER_LETTER_PAGINATION_EPSILON) {
    space = (pageIndex + 1) * pageHeight + pageMarginY - top
  }

  if (space <= COVER_LETTER_PAGINATION_EPSILON) return
  candidate.anchor.setAttribute(COVER_LETTER_PAGINATION_ATTRIBUTE, "true")
  candidate.anchor.style.setProperty(COVER_LETTER_PAGINATION_SPACE, `${space}px`)
}

function getCoverLetterPageBoundaryBlocks(element: HTMLElement) {
  return Array.from(element.querySelectorAll<HTMLElement>(
    ".cover-letter-masthead, .cover-letter-date, .cover-letter-recipient, .cover-letter-content > .resume-editable-field, .cover-letter-closing",
  )).filter((block) => !block.closest(".resume-page-guides"))
}

function getCoverLetterPageBreakDetails(
  element: HTMLElement,
  pageHeight: number,
  pageWidth: number,
  pageMarginY: number,
  pageCount: number,
): CoverLetterPageBreakDetail[] {
  const documentRect = element.getBoundingClientRect()
  const scale = documentRect.width > 0 && pageWidth > 0 ? documentRect.width / pageWidth : 1
  const blocks = getCoverLetterPageBoundaryBlocks(element)

  return Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => {
    const boundary = pageHeight * (index + 1)
    const contentBoundary = boundary - pageMarginY
    const crossingSections = blocks
      .filter((block) => {
        const rect = block.getBoundingClientRect()
        const top = (rect.top - documentRect.top) / scale
        const bottom = (rect.bottom - documentRect.top) / scale
        return (top < contentBoundary - COVER_LETTER_PAGINATION_EPSILON && bottom > contentBoundary + COVER_LETTER_PAGINATION_EPSILON)
          || (top < boundary - COVER_LETTER_PAGINATION_EPSILON && bottom > boundary + COVER_LETTER_PAGINATION_EPSILON)
      })
      .map((block) => getCoverLetterPageBlockLabel(block))

    return {
      page: index + 1,
      crossingSections: Array.from(new Set(crossingSections)),
    }
  })
}

function getCoverLetterPageBlockLabel(block: HTMLElement) {
  if (block.classList.contains("cover-letter-masthead")) return "Masthead"
  if (block.classList.contains("cover-letter-date")) return "Date"
  if (block.classList.contains("cover-letter-recipient")) return "Recipient"
  if (block.classList.contains("cover-letter-closing")) return "Closing"
  return "Letter body"
}

function arePageBreakDetailsEqual(current: CoverLetterPageBreakDetail[], next: CoverLetterPageBreakDetail[]) {
  if (current.length !== next.length) return false
  return current.every((detail, index) => {
    const nextDetail = next[index]
    return detail.page === nextDetail.page
      && detail.crossingSections.length === nextDetail.crossingSections.length
      && detail.crossingSections.every((section, sectionIndex) => section === nextDetail.crossingSections[sectionIndex])
  })
}

function formatCoverLetterPageBreakSections(sections: string[]) {
  if (sections.length <= 2) return sections.join(" + ")
  return `${sections.slice(0, 2).join(" + ")} + ${sections.length - 2} more`
}
