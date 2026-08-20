import { useState } from "react"
import { ChevronsUpDown, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { findGoogleFont, GOOGLE_FONTS, loadGoogleFont, type GoogleFont } from "@/lib/google-fonts"
import type { FontWeight, TypographyItem } from "@/lib/resume-types"

export type TypographyField = "body" | "heading"

export type DocumentTypography = {
  body: TypographyItem
  heading: TypographyItem
}

type TypographyControlsProps = {
  typography: DocumentTypography
  idPrefix: string
  headingLabel?: string
  onChange: (field: TypographyField, patch: Partial<TypographyItem>) => void
}

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

export function TypographyControls({
  typography,
  idPrefix,
  headingLabel = "Section headings",
  onChange,
}: TypographyControlsProps) {
  return (
    <>
      <TypographyGroup
        field="body"
        label="Body"
        idPrefix={idPrefix}
        typography={typography}
        onChange={onChange}
      />
      <TypographyGroup
        field="heading"
        label={headingLabel}
        idPrefix={idPrefix}
        typography={typography}
        onChange={onChange}
      />
    </>
  )
}

function TypographyGroup({
  field,
  label,
  idPrefix,
  typography: allTypography,
  onChange,
}: {
  field: TypographyField
  label: string
  idPrefix: string
  typography: DocumentTypography
  onChange: (field: TypographyField, patch: Partial<TypographyItem>) => void
}) {
  const typography = allTypography[field]
  const fontFamily = typography.fontFamily || (field === "heading" ? allTypography.body.fontFamily : "")
  const fontSizeId = `${idPrefix}-${field}-font-size`
  const lineHeightId = `${idPrefix}-${field}-line-height`
  const fontWeightsId = `${idPrefix}-${field}-font-weights`

  function updateNumber(key: "fontSize" | "lineHeight", rawValue: string) {
    const value = Number(rawValue)
    if (!Number.isFinite(value)) return
    const [minimum, maximum] = key === "fontSize" ? [6, 24] : [0.5, 4]
    onChange(field, { [key]: Math.min(maximum, Math.max(minimum, value)) })
  }

  function updateFont(font: GoogleFont) {
    loadGoogleFont(font.family)
    onChange(field, { fontFamily: font.family })
  }

  return (
    <div className="resume-typography-group">
      <div className="resume-design-section-divider"><span>{label}</span></div>
      <div className="resume-typography-fields">
        <div className="resume-design-field">
          <div className="resume-design-label-row">
            <Label htmlFor={`${idPrefix}-${field}-font`}>Font Family</Label>
          </div>
          <GoogleFontDropdown
            id={`${idPrefix}-${field}-font`}
            value={fontFamily}
            onChange={updateFont}
          />
        </div>

        <div className="resume-design-field">
          <div className="resume-design-label-row">
            <Label htmlFor={fontWeightsId}>{field === "body" ? "Font Weights" : "Font Weight"}</Label>
          </div>
          <FontWeightsDropdown
            id={fontWeightsId}
            value={typography.fontWeights}
            onChange={(fontWeights) => onChange(field, { fontWeights })}
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
