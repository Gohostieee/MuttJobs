import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  AtSign,
  Award,
  BadgeCheck,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CircleUserRound,
  Code2,
  ExternalLink,
  FolderGit2,
  Globe2,
  GraduationCap,
  Heart,
  Languages,
  Link2,
  Mail,
  MapPin,
  Phone,
  Quote,
  Sparkles,
  Star,
  Trophy,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react"

import type {
  AnyResumeItem,
  Level,
  RenderableSection,
  ResumeData,
  ResumeSectionAlignment,
  SectionType,
} from "@/lib/resume-types"
import { loadGoogleFonts } from "@/lib/google-fonts"
import { RichTextEditor } from "@/components/rich-text-editor"
import { sanitizeRichTextHtml } from "@/lib/rich-text"
import type {
  ResumeSelectionAction,
  ResumeTextSelection,
  ResumeTextSelectionContext,
} from "@/lib/resume-selection"

type ResumeDocumentProps = {
  resume: ResumeData
  compact?: boolean
  showPageGuides?: boolean
  renderPageSurfaces?: boolean
  paginate?: boolean
  onChange?: (resume: ResumeData, meta?: ResumeChangeMeta) => void
  onEditStart?: (key: string) => void
  onEditEnd?: () => void
  onEditCancel?: (key: string, resume: ResumeData) => void
  onTextSelection?: (selection: ResumeTextSelection | null) => void
  onSelectionAction?: (action: ResumeSelectionAction, selection: ResumeTextSelection) => void
  onSelectionRestoreChange?: (restore: (() => void) | null) => void
  selectionResetKey?: number
}

type ResumePath = Array<string | number>

export type ResumeChangeMeta = {
  kind: "text"
  key: string
}

type ResumeEditContext = {
  activeKey: string | null
  begin: (key: string) => void
  finish: () => void
  cancel: (path: ResumePath, value: string) => void
  update: (path: ResumePath, value: string) => void
  reportSelection: (selection: ResumeTextSelection | null) => void
  runSelectionAction: (action: ResumeSelectionAction, selection: ResumeTextSelection) => void
  reportSelectionRestore: (restore: (() => void) | null) => void
  selectionResetKey: number
}

export type ResumeSectionEntry = {
  id: string
  key: string
  type: SectionType
  title: string
  detail: string
  hidden: boolean
  columns: number
  alignment: ResumeSectionAlignment
  pageAlignment: ResumeSectionAlignment
  supportsItems: boolean
  supportsColumns: boolean
}

export type ResumeSectionDropPosition = "before" | "after"

type SectionDescriptor = {
  key: string
  section: RenderableSection
  type: SectionType
  path: ResumePath
}

type ResumePageBreakDetail = {
  page: number
  crossingSections: string[]
}

const FALLBACK_ORDER = [
  "summary",
  "experience",
  "education",
  "projects",
  "skills",
  "profiles",
  "certifications",
  "awards",
  "publications",
  "volunteer",
  "languages",
  "interests",
  "references",
]

const ICONS: Record<string, LucideIcon> = {
  atsign: AtSign,
  award: Award,
  badge: BadgeCheck,
  badgecheck: BadgeCheck,
  book: BookOpen,
  bookopen: BookOpen,
  briefcase: BriefcaseBusiness,
  calendar: CalendarDays,
  code: Code2,
  external: ExternalLink,
  folder: FolderGit2,
  globe: Globe2,
  graduation: GraduationCap,
  graduationcap: GraduationCap,
  heart: Heart,
  language: Languages,
  languages: Languages,
  link: Link2,
  mail: Mail,
  map: MapPin,
  mappin: MapPin,
  phone: Phone,
  quote: Quote,
  sparkles: Sparkles,
  star: Star,
  trophy: Trophy,
  user: UserRound,
  userround: UserRound,
  usercircle: CircleUserRound,
  users: Users,
}

export function getResumeSectionEntries(
  resume: ResumeData,
  { includeHidden = false }: { includeHidden?: boolean } = {},
): ResumeSectionEntry[] {
  const entries: ResumeSectionEntry[] = []
  const orderedKeys = getOrderedKeys(resume)
  const seen = new Set<string>()

  const addEntry = (key: string) => {
    if (seen.has(key)) return
    const descriptor = getSectionDescriptor(resume, key)
    if (!descriptor || !descriptor.section.enabled || (!includeHidden && descriptor.section.hidden)) return
    seen.add(key)
    entries.push({
      id: getResumeSectionId(key),
      key,
      type: descriptor.type,
      title: descriptor.section.title || titleCase(key),
      detail: getSectionDetail(descriptor.section),
      hidden: descriptor.section.hidden,
      columns: descriptor.section.columns,
      alignment: descriptor.section.alignment,
      pageAlignment: descriptor.section.pageAlignment,
      supportsItems: Boolean(descriptor.section.items),
      supportsColumns: Boolean(descriptor.section.items),
    })
  }

  orderedKeys.forEach(addEntry)

  return entries
}

export function reorderResumeSections(
  resume: ResumeData,
  sourceKey: string,
  targetKey: string,
  position: ResumeSectionDropPosition,
): ResumeData {
  if (sourceKey === targetKey) return resume

  const pages = resume.metadata.layout.pages.map((page) => ({
    ...page,
    main: [...page.main],
    sidebar: [...page.sidebar],
  }))
  const sourceSlot = findSectionSlot(pages, sourceKey)
  const targetSlot = findSectionSlot(pages, targetKey)

  if (!sourceSlot || !targetSlot) return resume

  const sourceKeys = pages[sourceSlot.pageIndex][sourceSlot.lane]
  const targetKeys = pages[targetSlot.pageIndex][targetSlot.lane]
  const sourceIndex = sourceKeys.indexOf(sourceKey)
  let targetIndex = targetKeys.indexOf(targetKey)

  if (sourceIndex < 0 || targetIndex < 0) return resume

  sourceKeys.splice(sourceIndex, 1)
  if (sourceKeys === targetKeys && sourceIndex < targetIndex) targetIndex -= 1
  if (position === "after") targetIndex += 1
  targetKeys.splice(targetIndex, 0, sourceKey)

  return {
    ...resume,
    metadata: {
      ...resume.metadata,
      layout: {
        ...resume.metadata.layout,
        pages,
      },
    },
  }
}

export const ResumeDocument = memo(function ResumeDocument({
  resume,
  compact = false,
  showPageGuides,
  renderPageSurfaces = true,
  paginate = true,
  onChange,
  onEditStart,
  onEditEnd,
  onEditCancel,
  onTextSelection,
  onSelectionAction,
  onSelectionRestoreChange,
  selectionResetKey = 0,
}: ResumeDocumentProps) {
  const [activeEditorKey, setActiveEditorKey] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(1)
  const [pageBreakDetails, setPageBreakDetails] = useState<ResumePageBreakDetail[]>([])
  const documentRef = useRef<HTMLElement>(null)
  const { colors, level } = resume.metadata.design
  const { body, heading, entryTitleSize, entrySubtitleSize, entryMetaSize } = resume.metadata.typography
  const { page } = resume.metadata
  const basics = resume.basics
  const picture = resume.picture
  const orderedKeys = getOrderedKeys(resume)
  const pages = resume.metadata.layout.pages
  const configuredKeys = new Set(pages.flatMap((configuredPage) => [...configuredPage.main, ...configuredPage.sidebar]))
  const extraKeys = orderedKeys.filter((key) => !configuredKeys.has(key))
  const pageWidth = getResumePageWidth(resume)
  const pageHeight = getResumePageHeight(resume)
  const pageMarginY = page.marginY * 3.78
  const bodyWeight = body.fontWeights[0] ?? "400"
  const bodyItalicWeight = body.fontWeights[1] ?? bodyWeight
  const bodyBoldWeight = body.fontWeights[2] ?? "700"
  const headingWeight = heading.fontWeights[0] ?? "600"
  const bodyFontWeightsKey = body.fontWeights.join(",")
  const headingFontWeightsKey = heading.fontWeights.join(",")
  const isMewtwo = resume.metadata.template === "mewtwo"
  const pageGuidesVisible = !compact && showPageGuides !== false

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

    if (!pageHeight || compact || !paginate) {
      clearResumePagination(element)
      setPageCount(1)
      setPageBreakDetails([])
      return
    }

    let frame: number | null = null
    const updatePageMetrics = () => {
      clearResumePagination(element)
      applyResumePagination(element, pageHeight, pageWidth, pageMarginY)
      const nextPageCount = Math.max(1, Math.ceil(element.scrollHeight / pageHeight))
      const nextPageBreakDetails = pageGuidesVisible
        ? getResumePageBreakDetails(element, pageHeight, pageWidth, pageMarginY, nextPageCount)
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
      clearResumePagination(element)
    }
  }, [compact, pageGuidesVisible, pageHeight, pageMarginY, pageWidth, paginate, resume])

  const editContext: ResumeEditContext | undefined = onChange ? {
    activeKey: activeEditorKey,
    begin: (key) => {
      setActiveEditorKey(key)
      onEditStart?.(key)
    },
    finish: () => {
      setActiveEditorKey(null)
      onEditEnd?.()
    },
    cancel: (path, value) => {
      const key = pathKey(path)
      setActiveEditorKey(null)
      onEditCancel?.(key, updateResumePath(resume, path, value))
    },
    update: (path, value) => onChange(updateResumePath(resume, path, value), { kind: "text", key: pathKey(path) }),
    reportSelection: (selection) => onTextSelection?.(selection),
    runSelectionAction: (action, selection) => onSelectionAction?.(action, selection),
    reportSelectionRestore: (restore) => onSelectionRestoreChange?.(restore),
    selectionResetKey,
  } : undefined
  const style = {
    "--resume-primary": colors.primary,
    "--resume-text": colors.text,
    "--resume-paper": colors.background,
    "--resume-body-font": body.fontFamily,
    "--resume-body-size": `${body.fontSize}pt`,
    "--resume-body-leading": body.lineHeight,
    "--resume-body-weight": bodyWeight,
    "--resume-body-italic-weight": bodyItalicWeight,
    "--resume-body-bold-weight": bodyBoldWeight,
    "--resume-heading-font": heading.fontFamily || body.fontFamily,
    "--resume-heading-size": `${heading.fontSize}pt`,
    "--resume-heading-leading": heading.lineHeight,
    "--resume-heading-weight": headingWeight,
    "--resume-entry-title-size": `${entryTitleSize}pt`,
    "--resume-entry-subtitle-size": `${entrySubtitleSize}pt`,
    "--resume-entry-meta-size": `${entryMetaSize}pt`,
    "--resume-page-width": `${pageWidth}px`,
    "--resume-page-height": `${pageHeight}px`,
    "--resume-margin-x": `${page.marginX * 3.78}px`,
    "--resume-margin-y": `${page.marginY * 3.78}px`,
    "--resume-gap-x": `${page.gapX * 3.78}px`,
    "--resume-gap-y": `${page.gapY * 3.78}px`,
  } as CSSProperties
  const printPageName = `resume-${page.format}`
  const printPageSize = page.format === "a4" ? "A4" : "Letter"

  const renderSection = (key: string) => {
    const descriptor = getSectionDescriptor(resume, key)
    if (!descriptor || !shouldRenderSection(descriptor, Boolean(editContext))) return null
    return (
      <ResumeSectionView
        key={key}
        descriptor={descriptor}
        editContext={editContext}
        hideIcons={page.hideIcons}
        hideSectionIcons={page.hideSectionIcons}
        level={level}
        hideLinkUnderline={page.hideLinkUnderline}
      />
    )
  }

  return (
    <article
      ref={documentRef}
      className={`resume-document resume-template-${resume.metadata.template} ${compact ? "is-compact" : ""} ${page.hideLinkUnderline ? "hide-link-underline" : ""}`}
      data-template={resume.metadata.template}
      data-format={page.format}
      data-page-count={pageHeight ? pageCount : 1}
      data-page-guides={pageGuidesVisible ? "visible" : "hidden"}
      lang={page.locale}
      style={style}
    >
      {!compact ? (
        <style media="print">{`@page ${printPageName} { size: ${printPageSize}; margin: ${page.marginY}mm ${page.marginX}mm; }`}</style>
      ) : null}
      {pageHeight && !compact && paginate && renderPageSurfaces ? (
        <div className="resume-page-guides resume-page-surfaces" aria-hidden="true">
          {Array.from({ length: pageCount }, (_, index) => (
            <div
              className={`resume-page-surface${index === pageCount - 1 ? " is-last-page" : ""}`}
              key={`page-surface-${index + 1}`}
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
              key={`page-margin-overlay-${index + 1}`}
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
              key={`page-label-${index + 1}`}
              style={{ top: `${pageHeight * index + Math.max(8, page.marginY * 1.9)}px` }}
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
              key={`page-break-${pageBreak.page}`}
              style={{ top: `${pageHeight * pageBreak.page}px` }}
            >
              <span className="resume-page-break-label">
                <strong>Page {pageBreak.page + 1}</strong>
                <span>
                  {pageBreak.crossingSections.length
                    ? `Cut through ${formatPageBreakSections(pageBreak.crossingSections)}`
                    : "Clean page boundary"}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {isMewtwo ? (
        <MewtwoHeader basics={basics} page={page} context={editContext} />
      ) : (
        <>
          <div className="resume-accent" />
          <header className="resume-header">
            <div className="resume-identity">
              <ResumeText
                context={editContext}
                path={["basics", "name"]}
                value={basics.name}
                as="h1"
                placeholder="Untitled resume"
              />
              {editContext || basics.headline ? (
                <ResumeText
                  context={editContext}
                  path={["basics", "headline"]}
                  value={basics.headline}
                  as="p"
                  className="resume-headline"
                  placeholder="Professional headline"
                />
              ) : null}
              <div className="resume-contact">
                {editContext || basics.email ? <Contact icon={AtSign} text={basics.email} href={basics.email ? `mailto:${basics.email}` : undefined} hideIcon={page.hideIcons} context={editContext} path={["basics", "email"]} placeholder="Email address" /> : null}
                {editContext || basics.phone ? <Contact icon={Phone} text={basics.phone} href={basics.phone ? `tel:${basics.phone}` : undefined} hideIcon={page.hideIcons} context={editContext} path={["basics", "phone"]} placeholder="Phone number" /> : null}
                {editContext || basics.location ? <Contact icon={MapPin} text={basics.location} hideIcon={page.hideIcons} context={editContext} path={["basics", "location"]} placeholder="Location" /> : null}
                {editContext || basics.website.url || basics.website.label ? (
                  <ContactLink website={basics.website} icon={Globe2} hideIcon={page.hideIcons} context={editContext} path={["basics", "website", "label"]} placeholder="Website" />
                ) : null}
                {basics.customFields.map((field, index) => editContext || field.text ? (
                  <div key={field.id || `custom-field-${index}`} className="resume-custom-field">
                    {!page.hideIcons ? <IconGlyph icon={field.icon} /> : null}
                    <ResumeText
                      context={editContext}
                      path={["basics", "customFields", index, "text"]}
                      value={field.text}
                      placeholder="Custom field"
                      renderValue={(content) => field.link ? <SafeLink href={field.link}>{content}</SafeLink> : content}
                    />
                  </div>
                ) : null)}
              </div>
            </div>
            {!picture.hidden && picture.url ? (
              <img
                className="resume-picture"
                src={picture.url}
                alt={basics.name ? `${basics.name} portrait` : "Resume portrait"}
                style={{
                  width: picture.size,
                  height: picture.size / picture.aspectRatio,
                  rotate: `${picture.rotation}deg`,
                  borderRadius: `${picture.borderRadius}%`,
                  borderColor: picture.borderColor,
                  borderWidth: `${picture.borderWidth}px`,
                  boxShadow: picture.shadowWidth ? `0 ${picture.shadowWidth}px ${picture.shadowWidth * 2}px ${picture.shadowColor}` : undefined,
                }}
              />
            ) : null}
          </header>
        </>
      )}

      <div className="resume-rule" />
      <div className="resume-sections">
        {pages.length ? pages.map((pageLayout, pageIndex) => {
          const configuredMainKeys = pageLayout.fullWidth ? [...pageLayout.main, ...pageLayout.sidebar] : pageLayout.main
          const mainKeys = uniqueKeys([...configuredMainKeys, ...(pageIndex === pages.length - 1 ? extraKeys : [])])
          const sidebarKeys = pageLayout.fullWidth ? [] : uniqueKeys(pageLayout.sidebar.filter((key) => !pageLayout.main.includes(key)))
          const hasSidebar = sidebarKeys.some((key) => {
            const descriptor = getSectionDescriptor(resume, key)
            return descriptor ? shouldRenderSection(descriptor, Boolean(editContext)) : false
          })
          return (
            <div
              className={`resume-page-layout ${hasSidebar ? "has-sidebar" : "full-width"}`}
              style={{ "--resume-sidebar-width": `${resume.metadata.layout.sidebarWidth}%` } as CSSProperties}
              key={`page-${pageIndex}`}
            >
              <div className="resume-main-column">{mainKeys.map(renderSection)}</div>
              {hasSidebar ? <aside className="resume-side-column">{sidebarKeys.map(renderSection)}</aside> : null}
            </div>
          )
        }) : orderedKeys.map(renderSection)}
      </div>
    </article>
  )
})

function MewtwoHeader({
  basics,
  page,
  context,
}: {
  basics: ResumeData["basics"]
  page: ResumeData["metadata"]["page"]
  context?: ResumeEditContext
}) {
  return (
    <header className="resume-header resume-mewtwo-header">
      <ResumeText
        context={context}
        path={["basics", "name"]}
        value={basics.name}
        as="h1"
        placeholder="Firstname Lastname"
      />
      {context || basics.headline ? (
        <ResumeText
          context={context}
          path={["basics", "headline"]}
          value={basics.headline}
          as="p"
          className="resume-mewtwo-headline"
          placeholder="Resume title"
        />
      ) : null}
      <div className="resume-contact resume-mewtwo-contact">
        {context || basics.email ? <Contact icon={AtSign} text={basics.email} href={basics.email ? `mailto:${basics.email}` : undefined} hideIcon={page.hideIcons} context={context} path={["basics", "email"]} placeholder="your.email@example.com" /> : null}
        {context || basics.phone ? <Contact icon={Phone} text={basics.phone} href={basics.phone ? `tel:${basics.phone}` : undefined} hideIcon={page.hideIcons} context={context} path={["basics", "phone"]} placeholder="phone number" /> : null}
        {context || basics.location ? <Contact icon={MapPin} text={basics.location} hideIcon={page.hideIcons} context={context} path={["basics", "location"]} placeholder="City, State" /> : null}
        {context || basics.website.url || basics.website.label ? (
          <ContactLink website={basics.website} icon={Globe2} hideIcon={page.hideIcons} context={context} path={["basics", "website", "label"]} placeholder="website" />
        ) : null}
        {basics.customFields.map((field, index) => context || field.text ? (
          <div key={field.id || `mewtwo-custom-field-${index}`} className="resume-custom-field">
            {!page.hideIcons ? <IconGlyph icon={field.icon} /> : null}
            <ResumeText
              context={context}
              path={["basics", "customFields", index, "text"]}
              value={field.text}
              placeholder="Custom field"
              renderValue={(content) => field.link ? <SafeLink href={field.link}>{content}</SafeLink> : content}
            />
          </div>
        ) : null)}
      </div>
    </header>
  )
}

function Contact({ icon: Icon, text, href, hideIcon, context, path, placeholder }: { icon: LucideIcon; text: string; href?: string; hideIcon: boolean; context?: ResumeEditContext; path: ResumePath; placeholder?: string }) {
  return (
    <div className="resume-contact-item">
      {!hideIcon ? <Icon aria-hidden="true" /> : null}
      <ResumeText context={context} path={path} value={text} placeholder={placeholder} renderValue={(content) => href ? <SafeLink href={href}>{content}</SafeLink> : content} />
    </div>
  )
}

function ContactLink({ website, icon: Icon, hideIcon, context, path, placeholder }: { website: { url: string; label: string }; icon: LucideIcon; hideIcon: boolean; context?: ResumeEditContext; path: ResumePath; placeholder?: string }) {
  const label = website.label || website.url
  return (
    <div className="resume-contact-item">
      {!hideIcon ? <Icon aria-hidden="true" /> : null}
      <ResumeText context={context} path={path} value={label} placeholder={placeholder} renderValue={(content) => <SafeLink href={website.url}>{content}</SafeLink>} />
    </div>
  )
}

function ResumeSectionView({
  descriptor,
  editContext,
  hideIcons,
  hideSectionIcons,
  level,
  hideLinkUnderline,
}: {
  descriptor: SectionDescriptor
  editContext?: ResumeEditContext
  hideIcons: boolean
  hideSectionIcons: boolean
  level: Level
  hideLinkUnderline: boolean
}) {
  const { section, key, type } = descriptor
  const visibleItems = section.items?.filter((item) => isRenderableItem(item) || Boolean(editContext && !item.hidden)) ?? []
  const hasSectionContent = key === "summary"
  return (
    <section
      className={`resume-section resume-section-${type}`}
      id={getResumeSectionId(key)}
      data-section-key={key}
      data-section-alignment={section.alignment}
      data-section-page-alignment={section.pageAlignment}
      style={{
        breakInside: section.keepTogether ? "avoid" : undefined,
        breakBefore: section.startOnNewPage ? "page" : undefined,
      }}
    >
      <div className="resume-section-heading">
        {!hideSectionIcons ? <IconGlyph icon={section.icon} /> : null}
        <ResumeText context={editContext} path={[...descriptor.path, "title"]} value={section.title} as="span" placeholder={titleCase(key)} />
        <i />
      </div>
      {hasSectionContent && (editContext || section.content) ? (
        <ResumeText
          context={editContext}
          path={[...descriptor.path, "content"]}
          value={section.content}
          as="div"
          className="resume-rich-text"
          inline={false}
          placeholder="Add a professional summary"
          selectionContext={{ fieldPath: [...descriptor.path, "content"], sectionKey: descriptor.key }}
        />
      ) : null}
      {visibleItems.length ? (
        <div
          className="resume-section-items"
          data-alignment={section.alignment}
          data-page-alignment={section.pageAlignment}
          style={{ "--resume-section-column-count": Math.max(1, section.columns) } as CSSProperties}
        >
          {visibleItems.map((item, index) => (
            <ResumeItemView
              item={item}
              itemIndex={section.items?.indexOf(item) ?? index}
              itemPath={[...descriptor.path, "items", section.items?.indexOf(item) ?? index]}
              editContext={editContext}
              sectionKey={descriptor.key}
              sectionType={type}
              hideIcons={hideIcons}
              level={level}
              hideLinkUnderline={hideLinkUnderline}
              key={item.id || `${key}-${index}`}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ResumeItemView({
  item,
  itemIndex,
  itemPath,
  editContext,
  sectionKey,
  sectionType,
  hideIcons,
  level,
  hideLinkUnderline,
}: {
  item: AnyResumeItem
  itemIndex: number
  itemPath: ResumePath
  editContext?: ResumeEditContext
  sectionKey: string
  sectionType: SectionType
  hideIcons: boolean
  level: Level
  hideLinkUnderline: boolean
}) {
  const record = item as unknown as Record<string, unknown>
  const kind = detectItemType(record, sectionType)
  const presentation = getItemPresentation(record, kind)
  const roles = kind === "experience" && Array.isArray(record.roles) ? record.roles : []
  const keywords = Array.isArray(presentation.keywords) ? presentation.keywords : []
  const hasHeading = Boolean(presentation.title || presentation.organization || presentation.meta.length || presentation.icon) || Boolean(editContext && kind !== "summary" && kind !== "cover-letter")
  const hasInlineWebsite = Boolean(presentation.website?.inlineLink && (presentation.title || presentation.organization || editContext))
  const titleField = getItemTitleField(kind)
  const descriptionField = kind === "summary" || kind === "cover-letter" ? "content" : "description"
  const hasDescription = hasDescriptionField(kind)

  return (
    <div
      className={`resume-item resume-item-${kind}`}
      data-resume-item-section={sectionKey}
      data-resume-item-index={itemIndex}
    >
      {kind === "cover-letter" && (presentation.recipient || editContext) ? (
        <div className="resume-recipient"><strong>To</strong><ResumeText context={editContext} path={[...itemPath, "recipient"]} value={presentation.recipient} placeholder="Recipient" /></div>
      ) : null}
      {hasHeading ? (
        <div className="resume-item-topline">
          <div className="resume-item-heading-content">
            {!hideIcons ? <IconGlyph icon={presentation.icon} color={presentation.iconColor} /> : null}
            <div>
              {kind !== "summary" && kind !== "cover-letter" ? <ResumeText context={editContext} path={[...itemPath, titleField]} value={presentation.title} as="h3" placeholder={getTitlePlaceholder(kind)} /> : null}
              {kind !== "summary" && kind !== "cover-letter" && (presentation.organization || editContext) ? <ItemOrganization kind={kind} record={record} itemPath={itemPath} context={editContext} /> : null}
              {hasInlineWebsite && presentation.website ? (
                  <div className="resume-link resume-link-inline">
                    <EditableWebsite website={presentation.website} itemPath={itemPath} context={editContext} hideLinkUnderline={hideLinkUnderline} />
                  </div>
              ) : null}
            </div>
          </div>
          <div className="resume-item-meta" aria-label="Additional details">
            <ItemMeta kind={kind} record={record} itemPath={itemPath} context={editContext} fallback={presentation.meta} />
          </div>
        </div>
      ) : null}
      {presentation.website && !hasInlineWebsite && (editContext || presentation.website.url || presentation.website.label) ? (
        <div className={`resume-link ${presentation.website.inlineLink ? "resume-link-inline" : ""}`}>
          <EditableWebsite website={presentation.website} itemPath={itemPath} context={editContext} hideLinkUnderline={hideLinkUnderline} />
        </div>
      ) : null}
      {hasDescription && (editContext || presentation.description) ? (
        <ResumeText
          context={editContext}
          path={[...itemPath, descriptionField]}
          value={presentation.description}
          as="div"
          className="resume-rich-text"
          inline={false}
          placeholder={getDescriptionPlaceholder(kind)}
          selectionContext={{ fieldPath: [...itemPath, descriptionField], sectionKey, itemId: itemIdForRecord(record) }}
        />
      ) : null}
      {roles.map((role, index) => {
        const roleRecord = role as Record<string, unknown>
        return (
          <div className="resume-role" key={String(roleRecord.id || `role-${index}`)}>
            <div className="resume-item-topline">
              <div><ResumeText context={editContext} path={[...itemPath, "roles", index, "position"]} value={stringValue(roleRecord.position)} as="h3" placeholder="Role title" /></div>
              <div className="resume-item-meta">
                {editContext || stringValue(roleRecord.period) ? <ResumeText context={editContext} path={[...itemPath, "roles", index, "period"]} value={stringValue(roleRecord.period)} as="span" placeholder="Role dates" /> : null}
              </div>
            </div>
            {editContext || stringValue(roleRecord.description) ? (
              <ResumeText
                context={editContext}
                path={[...itemPath, "roles", index, "description"]}
                value={stringValue(roleRecord.description)}
                as="div"
                className="resume-rich-text"
                inline={false}
                placeholder="Add role details"
                selectionContext={{ fieldPath: [...itemPath, "roles", index, "description"], sectionKey, itemId: itemIdForRecord(roleRecord) }}
              />
            ) : null}
          </div>
        )
      })}
      {keywords.length ? (
        <div className="resume-keywords">
          {kind === "skills" ? (
            <span>{keywords.join(", ")}</span>
          ) : (
            keywords.map((keyword, index) => (
              <Fragment key={`${keyword}-${index}`}>
                {index ? <span className="resume-keyword-separator" aria-hidden="true">, </span> : null}
                <ResumeText context={editContext} path={[...itemPath, "keywords", index]} value={keyword} as="span" />
              </Fragment>
            ))
          )}
        </div>
      ) : null}
      {presentation.level !== undefined && (kind !== "skills" || presentation.level > 0) ? <LevelIndicator value={presentation.level} config={level} hideIcons={hideIcons} /> : null}
      {kind === "references" && (editContext || presentation.phone) ? <div className="resume-phone">{!hideIcons ? <Phone aria-hidden="true" /> : null}<ResumeText context={editContext} path={[...itemPath, "phone"]} value={presentation.phone} placeholder="Phone number" /></div> : null}
    </div>
  )
}

function ItemOrganization({ kind, record, itemPath, context }: { kind: string; record: Record<string, unknown>; itemPath: ResumePath; context?: ResumeEditContext }) {
  const fields = getOrganizationFields(kind, record, Boolean(context))
  if (!fields.length) return null

  return (
    <div className="resume-organization">
      {fields.map((field, index) => (
        <Fragment key={field.key}>
          {index ? " · " : null}
          <ResumeText context={context} path={[...itemPath, field.key]} value={field.value} placeholder={getOrganizationPlaceholder(kind, field.key)} />
        </Fragment>
      ))}
    </div>
  )
}

function ItemMeta({ kind, record, itemPath, context, fallback }: { kind: string; record: Record<string, unknown>; itemPath: ResumePath; context?: ResumeEditContext; fallback: string[] }) {
  const fields = getMetaFields(kind, record, Boolean(context))
  const values = fields.length ? fields : fallback.map((value) => ({ key: "period", value }))
  return <>{values.map((field) => field.value || context ? <ResumeText context={context} path={[...itemPath, field.key]} value={field.value} as="span" placeholder={getMetaPlaceholder(field.key)} key={`${field.key}-${field.value}`} /> : null)}</>
}

function EditableWebsite({ website, itemPath, context, hideLinkUnderline }: { website: { url: string; label: string; inlineLink: boolean }; itemPath: ResumePath; context?: ResumeEditContext; hideLinkUnderline: boolean }) {
  const label = website.label || website.url
  return (
    <ResumeText
      context={context}
      path={[...itemPath, "website", "label"]}
      value={label}
      placeholder="Website"
      renderValue={(content) => <SafeLink href={website.url} className={hideLinkUnderline ? "no-underline" : undefined}>{content}</SafeLink>}
    />
  )
}

type ResumeTextProps = {
  context?: ResumeEditContext
  path: ResumePath
  value?: unknown
  as?: "h1" | "h3" | "p" | "span" | "div"
  className?: string
  inline?: boolean
  placeholder?: string
  renderValue?: (content: ReactNode) => ReactNode
  selectionContext?: ResumeTextSelectionContext
}

function ResumeText({ context, path, value, as = "span", className, inline = true, placeholder, renderValue, selectionContext }: ResumeTextProps) {
  const text = stringValue(value)
  const hasText = hasVisibleText(text)
  const resolvedPlaceholder = placeholder || getResumeFieldPlaceholder(path)
  const editKey = pathKey(path)
  const initialValueRef = useRef(text)
  const wasEditingRef = useRef(false)
  const Element = as
  const content = hasText ? <RichTextValue html={text} inline={inline} /> : <span className="resume-editable-placeholder">{resolvedPlaceholder}</span>
  const isEditing = context?.activeKey === editKey

  if (isEditing && !wasEditingRef.current) initialValueRef.current = text
  wasEditingRef.current = Boolean(isEditing)

  if (!hasText && !context) return null

  if (isEditing) {
    return (
      <div className="resume-editable-field is-editing">
          <RichTextEditor
            value={hasText ? text : ""}
            onChange={(nextValue) => context.update(path, nextValue)}
            onDone={context.finish}
            onCancel={() => context.cancel(path, initialValueRef.current)}
            placeholder={resolvedPlaceholder}
            selectionContext={selectionContext}
            selectionResetKey={context.selectionResetKey}
            onSelectionChange={context.reportSelection}
            onSelectionAction={context.runSelectionAction}
            onSelectionRestoreChange={context.reportSelectionRestore}
          />
      </div>
    )
  }

  return (
    <div className="resume-editable-field">
      <Element
        className={`${className || ""}${context ? " resume-editable-text" : ""}`.trim() || undefined}
        data-editable={context ? "true" : undefined}
        title={context ? "Click to edit" : undefined}
        aria-label={context && !hasText ? resolvedPlaceholder : undefined}
        onClick={context ? (event) => {
          event.preventDefault()
          event.stopPropagation()
          context.begin(editKey)
        } : undefined}
      >
        {renderValue ? renderValue(content) : content}
      </Element>
    </div>
  )
}

function itemIdForRecord(record: Record<string, unknown>) {
  return typeof record.id === "string" && record.id.trim() ? record.id : undefined
}

function getResumeFieldPlaceholder(path: ResumePath) {
  const field = String(path[path.length - 1] ?? "")
  const placeholders: Record<string, string> = {
    name: "Your name",
    headline: "Professional headline",
    email: "Email address",
    phone: "Phone number",
    location: "Location",
    label: "Website",
    title: "Section title",
    content: "Add text",
    description: "Add details",
    position: "Role title",
    period: "Dates",
    date: "Date",
    degree: "Degree",
    area: "Field of study",
    grade: "Grade",
    company: "Company",
    organization: "Organization",
    issuer: "Issuer",
    publisher: "Publisher",
    awarder: "Awarded by",
    proficiency: "Proficiency",
    fluency: "Fluency",
    username: "Username",
    network: "Network",
    recipient: "Recipient",
  }
  return placeholders[field] || "Add text"
}

function getTitlePlaceholder(kind: string) {
  const placeholders: Record<string, string> = {
    profiles: "Network",
    experience: "Position",
    education: "School",
    projects: "Project name",
    skills: "Skill category",
    languages: "Language",
    interests: "Interest",
    awards: "Award title",
    certifications: "Certification title",
    publications: "Publication title",
    volunteer: "Organization",
    references: "Name",
  }
  return placeholders[kind] || "Title"
}

function getDescriptionPlaceholder(kind: string) {
  if (kind === "summary") return "Add summary text"
  if (kind === "cover-letter") return "Add letter text"
  return "Add a description"
}

function hasDescriptionField(kind: string) {
  return [
    "summary",
    "cover-letter",
    "experience",
    "education",
    "projects",
    "awards",
    "certifications",
    "publications",
    "volunteer",
    "references",
  ].includes(kind)
}

function getOrganizationPlaceholder(kind: string, field: string) {
  if (kind === "education") {
    return { degree: "Degree", area: "Field of study", grade: "Grade" }[field] || "Details"
  }
  return getResumeFieldPlaceholder([field])
}

function getMetaPlaceholder(field: string) {
  return field === "location" ? "Location" : field === "date" ? "Date" : "Dates"
}

function LevelIndicator({ value, config, hideIcons }: { value: number; config: Level; hideIcons: boolean }) {
  if (config.type === "hidden" || hideIcons && config.type === "icon") return null
  const level = Math.round(clamp(value, 0, 5))
  if (config.type === "progress-bar") {
    return <span className="resume-level resume-level-progress"><span style={{ width: `${level * 20}%` }} /></span>
  }
  if (config.type === "icon") {
    return <span className="resume-level resume-level-icons">{Array.from({ length: 5 }, (_, index) => <IconGlyph key={index} icon={config.icon} muted={index >= level} />)}</span>
  }
  return (
    <span className={`resume-level resume-level-${config.type}`} aria-label={`Level ${level} of 5`}>
      {Array.from({ length: 5 }, (_, index) => <i className={index < level ? "is-filled" : ""} key={index} />)}
    </span>
  )
}

function IconGlyph({ icon, color, muted = false }: { icon?: string; color?: string; muted?: boolean }) {
  if (!icon) return null
  const Icon = ICONS[iconKey(icon)]
  if (Icon) return <Icon className={`resume-icon ${muted ? "is-muted" : ""}`} aria-hidden="true" style={color && !muted ? { color } : undefined} />
  return <span className={`resume-icon resume-icon-text ${muted ? "is-muted" : ""}`} style={color && !muted ? { color } : undefined} aria-hidden="true">{icon.slice(0, 2)}</span>
}

function RichTextValue({ html, inline = false }: { html: string; inline?: boolean }) {
  if (typeof DOMParser === "undefined") return inline ? <>{stripTags(html)}</> : <div className="resume-rich-text"><p>{stripTags(html)}</p></div>
  const document = new DOMParser().parseFromString(sanitizeRichTextHtml(html), "text/html")
  const nodes = Array.from(document.body.childNodes)
  if (!nodes.length) return null
  return <>{nodes.map((node, index) => renderRichNode(node, `${index}`, inline))}</>
}

function renderRichNode(node: Node, key: string, inline = false): ReactNode {
  if (node.nodeType === 3) return node.textContent
  if (node.nodeType !== 1) return null
  const element = node as HTMLElement
  const children = Array.from(element.childNodes).map((child, index) => renderRichNode(child, `${key}-${index}`, inline))
  switch (element.tagName.toLowerCase()) {
    case "br": return <br key={key} />
    case "ul": return inline ? <span key={key}>{children}</span> : <ul key={key}>{children}</ul>
    case "ol": return inline ? <span key={key}>{children}</span> : <ol key={key}>{children}</ol>
    case "li": return inline ? <span key={key}>{children}</span> : <li key={key}>{children}</li>
    case "strong":
    case "b": return <strong key={key}>{children}</strong>
    case "em":
    case "i": return <em key={key}>{children}</em>
    case "u": return <u key={key}>{children}</u>
    case "a": return <SafeLink key={key} href={element.getAttribute("href") || ""}>{children}</SafeLink>
    case "p":
    case "div":
    case "blockquote": return inline ? <span key={key}>{children}</span> : <p key={key}>{children}</p>
    default: return <span key={key}>{children}</span>
  }
}

function SafeLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const safeHref = normalizeHref(href)
  if (!safeHref) return <span className={className}>{children}</span>
  return <a className={className} href={safeHref} target={safeHref.startsWith("#") ? undefined : "_blank"} rel={safeHref.startsWith("#") ? undefined : "noreferrer"}>{children}</a>
}

function getItemTitleField(kind: string) {
  switch (kind) {
    case "profiles": return "network"
    case "experience": return "position"
    case "education": return "school"
    case "projects": return "name"
    case "skills": return "name"
    case "languages": return "language"
    case "interests": return "name"
    case "awards":
    case "certifications":
    case "publications": return "title"
    case "volunteer": return "organization"
    case "references": return "name"
    default: return "name"
  }
}

function getOrganizationFields(kind: string, record: Record<string, unknown>, includeEmpty = false) {
  const keys = getOrganizationKeys(kind)
  return keys.flatMap((key) => {
    const value = stringValue(record[key])
    return value || includeEmpty ? [{ key, value }] : []
  })
}

function getOrganizationKeys(kind: string) {
  switch (kind) {
    case "profiles": return ["username"]
    case "experience": return ["company"]
    case "education": return ["degree", "area", "grade"]
    case "skills": return ["proficiency"]
    case "languages": return ["fluency"]
    case "awards": return ["awarder"]
    case "certifications": return ["issuer"]
    case "publications": return ["publisher"]
    case "references": return ["position"]
    default: return []
  }
}

function getMetaFields(kind: string, record: Record<string, unknown>, includeEmpty = false) {
  const keys = (() => {
    switch (kind) {
      case "experience":
      case "education":
      case "volunteer": return ["period", "location"]
      case "projects": return ["period"]
      case "awards":
      case "certifications":
      case "publications": return ["date"]
      default: return []
    }
  })()
  return keys.flatMap((key) => {
    const value = stringValue(record[key])
    return value || includeEmpty ? [{ key, value }] : []
  })
}

function pathKey(path: ResumePath) {
  return path.map((part) => String(part)).join(".")
}

function updateResumePath(resume: ResumeData, path: ResumePath, value: string) {
  const next = { ...resume } as unknown as Record<string, unknown>
  let cursor = next

  path.forEach((part, index) => {
    if (index === path.length - 1) {
      cursor[String(part)] = value
      return
    }

    const current = cursor[String(part)]
    const copy = Array.isArray(current) ? [...current] : current && typeof current === "object" ? { ...(current as Record<string, unknown>) } : {}
    cursor[String(part)] = copy
    cursor = copy as Record<string, unknown>
  })

  return next as ResumeData
}

function getItemPresentation(record: Record<string, unknown>, kind: string) {
  const text = (...keys: string[]) => firstText(...keys.map((key) => record[key]))
  const website = record.website && typeof record.website === "object" ? record.website as { url?: string; label?: string; inlineLink?: boolean } : undefined
  const base = {
    title: "",
    organization: "",
    meta: [] as string[],
    description: "",
    website: website ? { url: stringValue(website.url), label: stringValue(website.label), inlineLink: Boolean(website.inlineLink) } : undefined,
    icon: stringValue(record.icon),
    iconColor: stringValue(record.iconColor),
    keywords: [] as string[],
    level: undefined as number | undefined,
    phone: "",
    recipient: "",
  }
  switch (kind) {
    case "cover-letter":
      return { ...base, recipient: text("recipient"), description: text("content", "description") }
    case "summary":
      return { ...base, description: text("content", "description") }
    case "profiles":
      return { ...base, title: text("network"), organization: text("username"), meta: [], }
    case "experience":
      return { ...base, title: text("position"), organization: text("company"), meta: compactValues(text("period"), text("location")), description: text("description") }
    case "education":
      return { ...base, title: text("school"), organization: compactValues(text("degree"), text("area"), text("grade")).join(" · "), meta: compactValues(text("period"), text("location")), description: text("description") }
    case "projects":
      return { ...base, title: text("name"), meta: compactValues(text("period")), description: text("description") }
    case "skills":
      return { ...base, title: text("name"), organization: text("proficiency"), keywords: stringArray(record.keywords), level: numberOrUndefined(record.level) }
    case "languages":
      return { ...base, title: text("language"), organization: text("fluency"), level: numberOrUndefined(record.level) }
    case "interests":
      return { ...base, title: text("name"), keywords: stringArray(record.keywords) }
    case "awards":
      return { ...base, title: text("title"), organization: text("awarder"), meta: compactValues(text("date")), description: text("description") }
    case "certifications":
      return { ...base, title: text("title"), organization: text("issuer"), meta: compactValues(text("date")), description: text("description") }
    case "publications":
      return { ...base, title: text("title"), organization: text("publisher"), meta: compactValues(text("date")), description: text("description") }
    case "volunteer":
      return { ...base, title: text("organization"), meta: compactValues(text("period"), text("location")), description: text("description") }
    case "references":
      return { ...base, title: text("name"), organization: text("position"), description: text("description"), phone: text("phone") }
    default:
      return { ...base, title: text("name", "title", "position"), organization: text("company", "issuer", "publisher"), meta: compactValues(text("period", "date"), text("location")), description: text("description", "content"), keywords: stringArray(record.keywords), level: numberOrUndefined(record.level) }
  }
}

function detectItemType(record: Record<string, unknown>, sectionType: SectionType) {
  if ("recipient" in record) return "cover-letter"
  if ("network" in record) return "profiles"
  if ("company" in record) return "experience"
  if ("school" in record) return "education"
  if ("organization" in record) return "volunteer"
  if ("language" in record) return "languages"
  if ("proficiency" in record) return "skills"
  if ("awarder" in record) return "awards"
  if ("issuer" in record) return "certifications"
  if ("publisher" in record) return "publications"
  if ("phone" in record) return "references"
  if (sectionType === "cover-letter") return "cover-letter"
  if (sectionType === "summary" && "content" in record) return "summary"
  return sectionType === "summary" ? "summary" : sectionType
}

function getSectionDescriptor(resume: ResumeData, key: string): SectionDescriptor | undefined {
  if (key === "summary") return { key, section: resume.summary, type: "summary", path: ["summary"] }
  const customIndex = key.startsWith("custom-") ? Number(key.slice("custom-".length)) : -1
  if (Number.isInteger(customIndex) && customIndex >= 0 && resume.customSections[customIndex]) {
    const section = resume.customSections[customIndex]
    return { key, section, type: section.type, path: ["customSections", customIndex] }
  }
  const customIndexById = resume.customSections.findIndex((section) => section.id === key)
  if (customIndexById >= 0) {
    const custom = resume.customSections[customIndexById]
    return { key, section: custom, type: custom.type, path: ["customSections", customIndexById] }
  }
  if (key in resume.sections) {
    return { key, section: resume.sections[key as keyof typeof resume.sections], type: key as SectionType, path: ["sections", key] }
  }
  return undefined
}

type SectionSlot = {
  pageIndex: number
  lane: "main" | "sidebar"
}

function findSectionSlot(
  pages: ResumeData["metadata"]["layout"]["pages"],
  key: string,
): SectionSlot | undefined {
  for (const [pageIndex, page] of pages.entries()) {
    if (page.main.includes(key)) return { pageIndex, lane: "main" }
    if (page.sidebar.includes(key)) return { pageIndex, lane: "sidebar" }
  }
  return undefined
}

function getOrderedKeys(resume: ResumeData) {
  const configured = resume.metadata.layout.pages.flatMap((page) => [...page.main, ...page.sidebar])
  const standardKeys = Object.keys(resume.sections)
  const customKeys = resume.customSections.map((section, index) => section.id || `custom-${index}`)
  const candidates = [...configured, ...FALLBACK_ORDER, ...standardKeys, ...customKeys]
  return uniqueKeys(candidates).filter((key) => Boolean(getSectionDescriptor(resume, key)))
}

function isVisibleSection(section: RenderableSection) {
  if (!section.enabled || section.hidden) return false
  return hasVisibleText(section.content) || Boolean(section.items?.some(isRenderableItem))
}

function shouldRenderSection(descriptor: SectionDescriptor, editable: boolean) {
  if (!descriptor.section.enabled || descriptor.section.hidden) return false
  return editable || isVisibleSection(descriptor.section)
}

function isRenderableItem(item: AnyResumeItem) {
  if (item.hidden) return false
  return Object.entries(item as unknown as Record<string, unknown>).some(([key, value]) => {
    if (key === "id" || key === "hidden" || key === "iconColor" || key === "inlineLink") return false
    return hasDisplayValue(value)
  })
}

function hasDisplayValue(value: unknown): boolean {
  if (typeof value === "string") return Boolean(value.trim())
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.some(hasDisplayValue)
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, nestedValue]) => key !== "inlineLink" && hasDisplayValue(nestedValue))
  }
  return false
}

function hasVisibleText(value: unknown) {
  return typeof value === "string" && htmlToLines(value).length > 0
}

function htmlToLines(html: string) {
  if (typeof DOMParser === "undefined") return stripTags(html).trim() ? [stripTags(html).trim()] : []
  const document = new DOMParser().parseFromString(html, "text/html")
  const blocks = Array.from(document.body.querySelectorAll("p, li"))
    .map((node) => node.textContent?.trim() ?? "")
    .filter(Boolean)
  const fallback = document.body.textContent?.trim()
  return blocks.length ? blocks : fallback ? [fallback] : []
}

function getSectionDetail(section: RenderableSection) {
  const itemCount = section.items?.filter(isRenderableItem).length ?? 0
  const hasContent = hasVisibleText(section.content)
  const details = []

  if (itemCount) details.push(`${itemCount} ${itemCount === 1 ? "entry" : "entries"}`)
  if (hasContent) details.push("Text")

  return details.length ? details.join(" · ") : "Empty section"
}

function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function firstText(...values: unknown[]) {
  const value = values.find((candidate) => typeof candidate === "string" && candidate.trim())
  return typeof value === "string" ? value : ""
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : ""
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []
}

function numberOrUndefined(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  return undefined
}

function compactValues(...values: string[]) {
  return values.filter(Boolean)
}

function uniqueKeys(keys: string[]) {
  return Array.from(new Set(keys))
}

function iconKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function normalizeHref(value: string) {
  const trimmed = value.trim()
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(trimmed)) return trimmed
  return ""
}

function titleCase(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/^./, (letter) => letter.toUpperCase())
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function getResumeSectionId(sectionKey: string) {
  return `resume-section-${sectionKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`
}

export function getResumePageWidth(resume: ResumeData) {
  if (resume.metadata.page.format === "letter") return 816
  if (resume.metadata.page.format === "free-form") return 960
  return 794
}

export function getResumePageHeight(resume: ResumeData) {
  if (resume.metadata.page.format === "letter") return 1056
  if (resume.metadata.page.format === "free-form") return 0
  return 1123
}

type ResumePaginationCandidate = {
  anchor: HTMLElement
  extent: HTMLElement
  canSplit: boolean
}

const RESUME_PAGINATION_EPSILON = 0.5
const RESUME_PAGINATION_ATTRIBUTE = "data-resume-pagination-break"
const RESUME_PAGINATION_SPACE = "--resume-pagination-space"

function clearResumePagination(element: HTMLElement) {
  element.querySelectorAll<HTMLElement>(`[${RESUME_PAGINATION_ATTRIBUTE}]`).forEach((node) => {
    node.removeAttribute(RESUME_PAGINATION_ATTRIBUTE)
    node.style.removeProperty(RESUME_PAGINATION_SPACE)
  })
}

function applyResumePagination(element: HTMLElement, pageHeight: number, pageWidth: number, pageMarginY: number) {
  const usableHeight = pageHeight - pageMarginY * 2
  if (usableHeight <= RESUME_PAGINATION_EPSILON) return

  const documentRect = element.getBoundingClientRect()
  const scale = documentRect.width > 0 && pageWidth > 0 ? documentRect.width / pageWidth : 1
  const flows = Array.from(element.querySelectorAll<HTMLElement>(".resume-main-column, .resume-side-column"))
  if (!flows.length) {
    const sections = element.querySelector<HTMLElement>(".resume-sections")
    if (sections) flows.push(sections)
  }

  flows.forEach((flow) => {
    getResumePaginationCandidates(flow).forEach((candidate) => {
      applyResumePaginationCandidate(candidate, documentRect, scale, pageHeight, pageMarginY, usableHeight)
    })
  })
}

function getResumePaginationCandidates(flow: HTMLElement): ResumePaginationCandidate[] {
  const sections = Array.from(flow.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("resume-section"))

  return sections.flatMap((section) => {
    if (section.style.breakInside === "avoid" || section.style.breakBefore === "page") {
      return [{ anchor: section, extent: section, canSplit: false }]
    }

    const sectionHeading = Array.from(section.children).find((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("resume-section-heading"))
    const itemsContainer = Array.from(section.children).find((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("resume-section-items"))
    const items = itemsContainer
      ? Array.from(itemsContainer.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("resume-item"))
      : []

    if (items.length) {
      return [
        ...(sectionHeading ? [{ anchor: sectionHeading, extent: sectionHeading, canSplit: false }] : []),
        ...items.flatMap(getResumeItemPaginationCandidates),
      ]
    }

    const blocks = getResumeContentBlocks(section)
    return blocks.length
      ? [
          ...(sectionHeading ? [{ anchor: sectionHeading, extent: sectionHeading, canSplit: false }] : []),
          ...blocks.map((block) => ({ anchor: block, extent: block, canSplit: true })),
        ]
      : [{ anchor: section, extent: section, canSplit: true }]
  })
}

function getResumeItemPaginationCandidates(item: HTMLElement): ResumePaginationCandidate[] {
  const blocks = getResumeContentBlocks(item)
  if (!blocks.length) return [{ anchor: item, extent: item, canSplit: true }]

  return blocks.flatMap((block) => {
    if (!block.classList.contains("resume-role")) return [{ anchor: block, extent: block, canSplit: true }]

    const roleBlocks = getResumeContentBlocks(block)
    return roleBlocks.length
      ? roleBlocks.map((roleBlock) => ({ anchor: roleBlock, extent: roleBlock, canSplit: true }))
      : [{ anchor: block, extent: block, canSplit: true }]
  })
}

function getResumeContentBlocks(container: HTMLElement): HTMLElement[] {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>(
    ".resume-role, .resume-item-topline, .resume-keywords, .resume-level, .resume-phone, .resume-link, .resume-rich-text > p, .resume-rich-text > ul > li, .resume-rich-text > ol > li, .resume-rich-text > div",
  ))
  const containerRole = container.classList.contains("resume-role") ? container : container.closest<HTMLElement>(".resume-role")

  return blocks
    .filter((block) => {
      if (block.classList.contains("resume-role")) return !containerRole
      return block.closest<HTMLElement>(".resume-role") === containerRole
    })
    .sort((left, right) => {
      const position = left.compareDocumentPosition(right)
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    })
}

function applyResumePaginationCandidate(
  candidate: ResumePaginationCandidate,
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

  if (candidate.canSplit && candidateHeight > usableHeight + RESUME_PAGINATION_EPSILON) {
    const blocks = getResumeContentBlocks(candidate.anchor)
    const nestedCandidates = blocks.length
      ? [
          { anchor: candidate.anchor, extent: blocks[0], canSplit: true },
          ...blocks.slice(1).map((block) => ({ anchor: block, extent: block, canSplit: true })),
        ]
      : []

    if (nestedCandidates.length && !(nestedCandidates.length === 1 && nestedCandidates[0].anchor === candidate.anchor && nestedCandidates[0].extent === candidate.extent)) {
      nestedCandidates.forEach((nestedCandidate) => {
        applyResumePaginationCandidate(nestedCandidate, documentRect, scale, pageHeight, pageMarginY, usableHeight)
      })
    }
    return
  }

  const pageIndex = Math.max(0, Math.floor(Math.max(0, top) / pageHeight))
  const pageStart = pageIndex * pageHeight + pageMarginY
  const pageEnd = (pageIndex + 1) * pageHeight - pageMarginY
  let space = 0

  if (top < pageStart - RESUME_PAGINATION_EPSILON) {
    space = pageStart - top
  } else if (bottom > pageEnd + RESUME_PAGINATION_EPSILON) {
    space = (pageIndex + 1) * pageHeight + pageMarginY - top
  }

  if (space <= RESUME_PAGINATION_EPSILON) return
  candidate.anchor.setAttribute(RESUME_PAGINATION_ATTRIBUTE, "true")
  candidate.anchor.style.setProperty(RESUME_PAGINATION_SPACE, `${space}px`)
}

function getResumePageBoundaryBlocks(element: HTMLElement) {
  const structuralBlocks = Array.from(element.querySelectorAll<HTMLElement>(
    ".resume-section-heading, .resume-item-topline, .resume-role, .resume-keywords, .resume-level, .resume-phone, .resume-link, .resume-rich-text > p, .resume-rich-text > ul > li, .resume-rich-text > ol > li, .resume-rich-text > div",
  ))
  const hasStructuralContent = (item: HTMLElement) => item.querySelector(
    ".resume-section-heading, .resume-item-topline, .resume-role, .resume-keywords, .resume-level, .resume-phone, .resume-link, .resume-rich-text > p, .resume-rich-text > ul > li, .resume-rich-text > ol > li, .resume-rich-text > div",
  )
  const emptyItems = Array.from(element.querySelectorAll<HTMLElement>(".resume-item")).filter((item) => !hasStructuralContent(item))
  return [...structuralBlocks, ...emptyItems]
    .filter((block) => !block.closest(".resume-page-guides"))
    .sort((left, right) => {
      const position = left.compareDocumentPosition(right)
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    })
}

function getResumePageBreakDetails(
  element: HTMLElement,
  pageHeight: number,
  pageWidth: number,
  pageMarginY: number,
  pageCount: number,
): ResumePageBreakDetail[] {
  const documentRect = element.getBoundingClientRect()
  const scale = documentRect.width > 0 && pageWidth > 0 ? documentRect.width / pageWidth : 1
  const blocks = getResumePageBoundaryBlocks(element)

  return Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => {
    const boundary = pageHeight * (index + 1)
    const contentBoundary = boundary - pageMarginY
    const crossingSections = blocks
      .filter((block) => {
        const rect = block.getBoundingClientRect()
        const top = (rect.top - documentRect.top) / scale
        const bottom = (rect.bottom - documentRect.top) / scale
        return (top < contentBoundary - RESUME_PAGINATION_EPSILON && bottom > contentBoundary + RESUME_PAGINATION_EPSILON)
          || (top < boundary - RESUME_PAGINATION_EPSILON && bottom > boundary + RESUME_PAGINATION_EPSILON)
      })
      .map((block) => {
        const section = block.closest<HTMLElement>(".resume-section[data-section-key]")
        const heading = section?.querySelector<HTMLElement>(".resume-section-heading")?.textContent
        return heading?.replace(/\s+/g, " ").trim() || "Untitled section"
      })

    return {
      page: index + 1,
      crossingSections: Array.from(new Set(crossingSections)),
    }
  })
}

function arePageBreakDetailsEqual(current: ResumePageBreakDetail[], next: ResumePageBreakDetail[]) {
  if (current.length !== next.length) return false
  return current.every((detail, index) => {
    const nextDetail = next[index]
    return detail.page === nextDetail.page
      && detail.crossingSections.length === nextDetail.crossingSections.length
      && detail.crossingSections.every((section, sectionIndex) => section === nextDetail.crossingSections[sectionIndex])
  })
}

function formatPageBreakSections(sections: string[]) {
  if (sections.length <= 2) return sections.join(" + ")
  return `${sections.slice(0, 2).join(" + ")} + ${sections.length - 2} more`
}
