import { useState } from "react"
import { ChevronDown, ChevronsUpDown, Plus, Type, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TypographyControls } from "@/components/typography-controls"
import { findGoogleFont, GOOGLE_FONTS, type GoogleFont } from "@/lib/google-fonts"
import { RESUME_TEMPLATE_OPTIONS } from "@/lib/resume-templates"
import type { FontWeight, Page, ResumeData, Template, Typography, TypographyItem } from "@/lib/resume-types"

type ResumeDesignPanelProps = {
  resume: ResumeData
  onChange: (resume: ResumeData) => void
}

type FontField = "body" | "heading"
type EntrySizeField = "entryTitleSize" | "entrySubtitleSize" | "entryMetaSize"

const FONT_WEIGHTS: Array<{ value: FontWeight; label: string }> = [
  { value: "100", label: "Thin · 100" },
  { value: "200", label: "Extra light · 200" },
  { value: "300", label: "Light · 300" },
  { value: "400", label: "Regular · 400" },
  { value: "500", label: "Medium · 500" },
  { value: "600", label: "Semibold · 600" },
  { value: "700", label: "Bold · 700" },
  { value: "800", label: "Extra bold · 800" },
  { value: "900", label: "Black · 900" },
]

const PAGE_WIDTHS: Array<{ value: Page["format"]; label: string; detail: string }> = [
  { value: "a4", label: "A4", detail: "794 × 1123 px · 210 × 297 mm" },
  { value: "letter", label: "Letter", detail: "816 × 1056 px · 8.5 × 11 in" },
  { value: "free-form", label: "Wide", detail: "960 px canvas · no fixed height" },
]

export function ResumeDesignPanel({ resume, onChange }: ResumeDesignPanelProps) {
  const [typographyOpen, setTypographyOpen] = useState(true)
  const pageFormat = resume.metadata.page.format

  function updateTypography(field: FontField, patch: Partial<TypographyItem>) {
    onChange({
      ...resume,
      metadata: {
        ...resume.metadata,
        typography: {
          ...resume.metadata.typography,
          [field]: {
            ...resume.metadata.typography[field],
            ...patch,
          },
        },
      },
    })
  }

  function updateEntrySize(field: EntrySizeField, rawValue: string) {
    const value = Number(rawValue)
    if (!Number.isFinite(value)) return
    const nextValue = Math.min(24, Math.max(6, value))
    onChange({
      ...resume,
      metadata: {
        ...resume.metadata,
        typography: {
          ...resume.metadata.typography,
          ...(field === "entrySubtitleSize" || field === "entryMetaSize"
            ? { entrySubtitleSize: nextValue, entryMetaSize: nextValue }
            : { [field]: nextValue }),
        },
      },
    })
  }

  function updatePageFormat(format: Page["format"]) {
    if (format === pageFormat) return
    onChange({
      ...resume,
      metadata: {
        ...resume.metadata,
        page: {
          ...resume.metadata.page,
          format,
        },
      },
    })
  }

  function updatePageMargin(axis: "marginX" | "marginY", rawValue: string) {
    const value = Number(rawValue)
    if (!Number.isFinite(value)) return

    onChange({
      ...resume,
      metadata: {
        ...resume.metadata,
        page: {
          ...resume.metadata.page,
          [axis]: Math.min(60, Math.max(0, value)),
        },
      },
    })
  }

  function updateTemplate(template: Template) {
    if (template === resume.metadata.template) return
    onChange({
      ...resume,
      metadata: {
        ...resume.metadata,
        template,
      },
    })
  }

  const selectedTemplate = RESUME_TEMPLATE_OPTIONS.find((option) => option.value === resume.metadata.template) ?? RESUME_TEMPLATE_OPTIONS[0]

  return (
    <section className="resume-design-panel" aria-labelledby="resume-design-heading">
      <div className="resume-design-panel-heading">
        <Button
          type="button"
          variant="ghost"
          className="resume-design-title"
          aria-expanded={typographyOpen}
          aria-controls="resume-typography-settings"
          onClick={() => setTypographyOpen((open) => !open)}
        >
          <span className="resume-design-title-icon" aria-hidden="true">
            <Type />
          </span>
          <span className="resume-design-title-text">
            <span className="resume-design-title-kicker">Design</span>
            <h2 id="resume-design-heading">Typography</h2>
          </span>
          <ChevronDown className={`resume-design-title-chevron${typographyOpen ? "" : " is-collapsed"}`} aria-hidden="true" />
        </Button>
      </div>

      <div className="resume-design-fields" id="resume-typography-settings" hidden={!typographyOpen}>
        <TypographyControls
          typography={resume.metadata.typography}
          idPrefix="resume"
          onChange={updateTypography}
        />
        <EntryTypographyGroup typography={resume.metadata.typography} onSizeChange={updateEntrySize} />

        <div className="resume-typography-group">
          <div className="resume-design-section-divider"><span>Document</span></div>
          <div className="resume-typography-fields">
            <div className="resume-design-field">
              <div className="resume-design-label-row">
                <Label htmlFor="resume-template">Template</Label>
                <span>Resume styles</span>
              </div>
              <NativeSelect
                id="resume-template"
                className="w-full"
                value={resume.metadata.template}
                onChange={(event) => updateTemplate(event.currentTarget.value as Template)}
              >
                {RESUME_TEMPLATE_OPTIONS.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="resume-design-help">{selectedTemplate.detail}.</p>
            </div>

            <div className="resume-design-field">
              <div className="resume-design-label-row">
                <Label htmlFor="resume-page-width">Paper size</Label>
                <span>{pageFormat === "free-form" ? "Wide" : "Print ready"}</span>
              </div>
              <NativeSelect
                id="resume-page-width"
                className="w-full"
                value={pageFormat}
                onChange={(event) => updatePageFormat(event.currentTarget.value as Page["format"])}
              >
                {PAGE_WIDTHS.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="resume-design-help">
                {PAGE_WIDTHS.find((option) => option.value === pageFormat)?.detail}. Page breaks follow the selected print size.
              </p>
            </div>

            <div className="resume-design-field-row">
              <div className="resume-design-field">
                <div className="resume-design-label-row">
                  <Label htmlFor="resume-page-margin-x">Horizontal margin</Label>
                </div>
                <div className="resume-design-input-wrap">
                  <Input
                    id="resume-page-margin-x"
                    type="number"
                    min={0}
                    max={60}
                    step={1}
                    value={resume.metadata.page.marginX}
                    onChange={(event) => updatePageMargin("marginX", event.currentTarget.value)}
                  />
                  <span>mm</span>
                </div>
              </div>

              <div className="resume-design-field">
                <div className="resume-design-label-row">
                  <Label htmlFor="resume-page-margin-y">Vertical margin</Label>
                </div>
                <div className="resume-design-input-wrap">
                  <Input
                    id="resume-page-margin-y"
                    type="number"
                    min={0}
                    max={60}
                    step={1}
                    value={resume.metadata.page.marginY}
                    onChange={(event) => updatePageMargin("marginY", event.currentTarget.value)}
                  />
                  <span>mm</span>
                </div>
              </div>
            </div>
            <p className="resume-design-help">Margins control the printable area on all sides of the selected paper.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

export function TypographyGroup({
  field,
  label,
  resume,
  onFontChange,
  onTypographyChange,
}: {
  field: FontField
  label: string
  resume: ResumeData
  onFontChange: (field: FontField, font: GoogleFont) => void
  onTypographyChange: (field: FontField, patch: Partial<TypographyItem>) => void
}) {
  const typography = resume.metadata.typography[field]
  const fontFamily = typography.fontFamily || (field === "heading" ? resume.metadata.typography.body.fontFamily : "")
  const fontSizeId = `resume-${field}-font-size`
  const lineHeightId = `resume-${field}-line-height`
  const fontWeightsId = `resume-${field}-font-weights`

  function updateNumber(key: "fontSize" | "lineHeight", rawValue: string) {
    const value = Number(rawValue)
    if (!Number.isFinite(value)) return
    const [minimum, maximum] = key === "fontSize" ? [6, 24] : [0.5, 4]
    onTypographyChange(field, { [key]: Math.min(maximum, Math.max(minimum, value)) })
  }

  return (
    <div className="resume-typography-group">
      <div className="resume-design-section-divider"><span>{label}</span></div>
      <div className="resume-typography-fields">
        <div className="resume-design-field">
          <div className="resume-design-label-row">
            <Label htmlFor={`resume-${field}-font`}>Font Family</Label>
          </div>
          <GoogleFontDropdown
            id={`resume-${field}-font`}
            value={fontFamily}
            onChange={(font) => onFontChange(field, font)}
          />
        </div>

        <div className="resume-design-field">
          <div className="resume-design-label-row">
            <Label htmlFor={fontWeightsId}>{field === "body" ? "Font Weights" : "Font Weight"}</Label>
          </div>
          <FontWeightsDropdown
            id={fontWeightsId}
            value={typography.fontWeights}
            onChange={(fontWeights) => onTypographyChange(field, { fontWeights })}
          />
        </div>

        <div className="resume-design-field-row">
          <div className="resume-design-field">
            <div className="resume-design-label-row">
              <Label htmlFor={fontSizeId}>Size</Label>
            </div>
            <div className="resume-design-input-wrap">
              <Input
                id={fontSizeId}
                type="number"
                min={6}
                max={24}
                step="0.5"
                value={typography.fontSize}
                onChange={(event) => updateNumber("fontSize", event.currentTarget.value)}
              />
              <span aria-hidden="true">pt</span>
            </div>
          </div>

          <div className="resume-design-field">
            <div className="resume-design-label-row">
              <Label htmlFor={lineHeightId}>Line height</Label>
            </div>
            <div className="resume-design-input-wrap">
              <Input
                id={lineHeightId}
                type="number"
                min={0.5}
                max={4}
                step="0.1"
                value={typography.lineHeight}
                onChange={(event) => updateNumber("lineHeight", event.currentTarget.value)}
              />
              <span aria-hidden="true">×</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EntryTypographyGroup({
  typography,
  onSizeChange,
}: {
  typography: Typography
  onSizeChange: (field: EntrySizeField, value: string) => void
}) {
  return (
    <div className="resume-typography-group">
      <div className="resume-design-section-divider"><span>Entry hierarchy</span></div>
      <div className="resume-typography-fields">
        <TypographySizeField
          id="resume-entry-title-size"
          label="Job title / item title"
          detail="Position, school, or project"
          value={typography.entryTitleSize}
          onChange={(value) => onSizeChange("entryTitleSize", value)}
        />
        <TypographySizeField
          id="resume-entry-supporting-size"
          label="Supporting text / details"
          detail="Employers, organizations, dates, locations, and metadata"
          value={typography.entrySubtitleSize}
          onChange={(value) => onSizeChange("entrySubtitleSize", value)}
        />
      </div>
    </div>
  )
}

function TypographySizeField({
  id,
  label,
  detail,
  value,
  onChange,
}: {
  id: string
  label: string
  detail: string
  value: number
  onChange: (value: string) => void
}) {
  return (
    <div className="resume-design-field">
      <div className="resume-design-label-row">
        <Label htmlFor={id}>{label}</Label>
        <span>{detail}</span>
      </div>
      <div className="resume-design-input-wrap">
        <Input
          id={id}
          type="number"
          min={6}
          max={24}
          step="0.5"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <span aria-hidden="true">pt</span>
      </div>
    </div>
  )
}

function FontWeightsDropdown({
  id,
  value,
  onChange,
}: {
  id: string
  value: FontWeight[]
  onChange: (fontWeights: FontWeight[]) => void
}) {
  const [open, setOpen] = useState(false)
  const weights = value.length ? value : ["400" as FontWeight]

  function updateWeight(index: number, weight: FontWeight) {
    onChange(weights.map((current, currentIndex) => currentIndex === index ? weight : current))
  }

  function removeWeight(index: number) {
    if (weights.length === 1) return
    onChange(weights.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="resume-design-select-trigger w-full justify-between font-normal"
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="truncate">{weights.join(", ")}</span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="resume-font-weights-popover w-[var(--radix-popover-trigger-width)]" align="start">
        <div className="resume-font-weights-list" role="listbox" aria-label="Font weights">
          {weights.map((weight, index) => (
            <div className="resume-font-weight-row" key={`font-weight-${index}`}>
              <span className="resume-font-weight-index">{index + 1}</span>
              <NativeSelect
                className="w-full"
                aria-label={`Font weight ${index + 1}`}
                value={weight}
                onChange={(event) => updateWeight(index, event.currentTarget.value as FontWeight)}
              >
                {FONT_WEIGHTS.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => removeWeight(index)}
                disabled={weights.length === 1}
                aria-label={`Remove font weight ${index + 1}`}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="resume-font-weight-add"
          onClick={() => onChange([...weights, "400"])}
        >
          <Plus aria-hidden="true" />
          Add weight
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function GoogleFontDropdown({ id, value, onChange }: { id: string; value: string; onChange: (font: GoogleFont) => void }) {
  const [open, setOpen] = useState(false)
  const selectedFont = findGoogleFont(value)

  function selectFont(font: GoogleFont) {
    onChange(font)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="resume-design-select-trigger w-full justify-between font-normal"
          aria-expanded={open}
          role="combobox"
        >
          <span
            className="truncate"
            style={{ fontFamily: selectedFont ? `'${selectedFont.family}', sans-serif` : undefined }}
          >
            {value || "Choose a font"}
          </span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search Google Fonts..." />
          <CommandList>
            <CommandEmpty>No Google Fonts found.</CommandEmpty>
            {GOOGLE_FONTS.map((font) => (
              <CommandItem
                key={font.family}
                value={`${font.family} ${font.category} ${font.description}`}
                data-checked={font.family === value}
                onSelect={() => selectFont(font)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate" style={{ fontFamily: `'${font.family}', sans-serif` }}>
                    {font.family}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{font.description}</span>
                </span>
                <span className="text-xs text-muted-foreground">{font.category === "Sans serif" ? "Sans" : "Serif"}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
