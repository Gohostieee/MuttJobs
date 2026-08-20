import { Plus, Trash2, X } from "lucide-react"
import type { ReactNode } from "react"

import { TypographyControls, type TypographyField } from "@/components/typography-controls"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import type { CoverLetterData, CoverLetterPage } from "@/lib/cover-letter-types"
import type { TypographyItem } from "@/lib/resume-types"

type Path = Array<string | number>

const PAGE_OPTIONS: Array<{ value: CoverLetterPage["format"]; label: string; detail: string }> = [
  { value: "a4", label: "A4", detail: "794 × 1123 px · 210 × 297 mm" },
  { value: "letter", label: "Letter", detail: "816 × 1056 px · 8.5 × 11 in" },
]

export function CoverLetterInspector({
  letter,
  onChange,
  onEditStart,
  onEditEnd,
  onToggle,
}: {
  letter: CoverLetterData
  onChange: (letter: CoverLetterData, meta?: { kind: "text"; key: string }) => void
  onEditStart: (key: string) => void
  onEditEnd: () => void
  onToggle: () => void
}) {
  function update(path: Path, value: unknown, text = true) {
    onChange(setAtPath(letter, path, value), text ? { kind: "text", key: pathKey(path) } : undefined)
  }

  function addBodyParagraph() {
    if (letter.content.body.length >= 4) return
    update(["content", "body"], [...letter.content.body, ""], false)
  }

  function removeBodyParagraph(index: number) {
    if (letter.content.body.length <= 1) return
    update(["content", "body"], letter.content.body.filter((_, candidate) => candidate !== index), false)
  }

  function updateTypography(field: TypographyField, patch: Partial<TypographyItem>) {
    update(
      ["metadata", "typography", field],
      { ...letter.metadata.typography[field], ...patch },
      false,
    )
  }

  const fieldProps = (path: Path) => ({
    onFocus: () => onEditStart(pathKey(path)),
    onBlur: onEditEnd,
  })

  return (
    <aside className="cover-letter-inspector" id="cover-letter-inspector" aria-label="Cover letter details">
      <header className="cover-letter-inspector-header">
        <div><span>Letter structure</span><h2>Letter details</h2></div>
        <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Hide letter details"><X /></Button>
      </header>
      <div className="cover-letter-inspector-scroll">
        <Accordion type="multiple" defaultValue={["typography", "page", "applicant", "recipient", "position", "content"]}>
          <InspectorSection value="typography" title="Typography">
            <TypographyControls
              typography={letter.metadata.typography}
              idPrefix="cover-letter"
              headingLabel="Applicant name"
              onChange={updateTypography}
            />
          </InspectorSection>

          <InspectorSection value="page" title="Page & margins">
            <PageSettings letter={letter} update={update} fieldProps={fieldProps} />
          </InspectorSection>

          <InspectorSection value="metadata" title="Date">
            <Field label="Date of letter"><Input type="date" value={letter.metadata.date} onChange={(event) => update(["metadata", "date"], event.target.value)} {...fieldProps(["metadata", "date"])} /></Field>
          </InspectorSection>

          <InspectorSection value="applicant" title="Your information">
            <StringInput label="Name" path={["applicant", "name"]} value={letter.applicant.name} update={update} fieldProps={fieldProps} />
            <StringInput label="Email" path={["applicant", "email"]} value={letter.applicant.email ?? ""} type="email" update={update} fieldProps={fieldProps} />
            <StringInput label="Phone" path={["applicant", "phone"]} value={letter.applicant.phone ?? ""} update={update} fieldProps={fieldProps} />
            <AddressFields prefix={["applicant", "address"]} address={letter.applicant.address} update={update} fieldProps={fieldProps} />
          </InspectorSection>

          <InspectorSection value="recipient" title="Recipient">
            <StringInput label="Contact name" path={["recipient", "name"]} value={letter.recipient.name ?? ""} update={update} fieldProps={fieldProps} nullable />
            <StringInput label="Contact title" path={["recipient", "title"]} value={letter.recipient.title ?? ""} update={update} fieldProps={fieldProps} nullable />
            <StringInput label="Company name" path={["recipient", "company"]} value={letter.recipient.company} update={update} fieldProps={fieldProps} />
            <StringInput label="Salutation" path={["recipient", "salutation"]} value={letter.recipient.salutation} update={update} fieldProps={fieldProps} />
            <AddressFields prefix={["recipient", "address"]} address={letter.recipient.address} update={update} fieldProps={fieldProps} />
          </InspectorSection>

          <InspectorSection value="position" title="Position">
            <StringInput label="Position or type of work" path={["position", "title"]} value={letter.position.title} update={update} fieldProps={fieldProps} />
            <StringInput label="Where you heard about it" path={["position", "source"]} value={letter.position.source ?? ""} update={update} fieldProps={fieldProps} nullable />
          </InspectorSection>

          <InspectorSection value="content" title="Paragraphs">
            <TextField label="Opening paragraph" path={["content", "opening"]} value={letter.content.opening} update={update} fieldProps={fieldProps} />
            {letter.content.body.map((paragraph, index) => (
              <div className="cover-letter-body-editor" key={`body-inspector-${index}`}>
                <div className="cover-letter-field-group-heading">
                  <h3>Middle paragraph {index + 1}</h3>
                  <Button variant="ghost" size="icon-xs" disabled={letter.content.body.length <= 1} onClick={() => removeBodyParagraph(index)} aria-label={`Remove middle paragraph ${index + 1}`}><Trash2 /></Button>
                </div>
                <TextField label="Paragraph text" path={["content", "body", index]} value={paragraph} update={update} fieldProps={fieldProps} />
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full" disabled={letter.content.body.length >= 4} onClick={addBodyParagraph}><Plus /> Add middle paragraph</Button>
            <TextField label="Closing paragraph" path={["content", "closingParagraph"]} value={letter.content.closingParagraph} update={update} fieldProps={fieldProps} />
          </InspectorSection>

          <InspectorSection value="closing" title="Sign-off">
            <StringInput label="Sign-off" path={["closing", "signOff"]} value={letter.closing.signOff} update={update} fieldProps={fieldProps} />
            <StringInput label="Typed name" path={["closing", "name"]} value={letter.closing.name} update={update} fieldProps={fieldProps} />
          </InspectorSection>
        </Accordion>
      </div>
    </aside>
  )
}

function InspectorSection({ value, title, children }: { value: string; title: string; children: ReactNode }) {
  return <AccordionItem value={value}><AccordionTrigger>{title}</AccordionTrigger><AccordionContent><div className="cover-letter-field-stack">{children}</div></AccordionContent></AccordionItem>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="cover-letter-field"><Label>{label}</Label>{children}</div>
}

type FieldHelpers = {
  update: (path: Path, value: unknown, text?: boolean) => void
  fieldProps: (path: Path) => { onFocus: () => void; onBlur: () => void }
}

function StringInput({ label, path, value, type = "text", update, fieldProps, nullable = false }: FieldHelpers & { label: string; path: Path; value: string; type?: string; nullable?: boolean }) {
  return <Field label={label}><Input type={type} value={value} onChange={(event) => update(path, nullable && !event.target.value ? null : event.target.value)} {...fieldProps(path)} /></Field>
}

function TextField({ label, path, value, update, fieldProps }: FieldHelpers & { label: string; path: Path; value: string }) {
  return <Field label={label}><Textarea value={value} onChange={(event) => update(path, event.target.value)} {...fieldProps(path)} /></Field>
}

function PageSettings({
  letter,
  update,
  fieldProps,
}: {
  letter: CoverLetterData
  update: FieldHelpers["update"]
  fieldProps: FieldHelpers["fieldProps"]
}) {
  const page = letter.metadata.page

  function updateMargin(path: Path, rawValue: string) {
    const value = Number(rawValue)
    if (!Number.isFinite(value)) return
    update(path, Math.min(60, Math.max(0, value)), false)
  }

  return (
    <>
      <Field label="Paper size">
        <NativeSelect
          value={page.format}
          onChange={(event) => update(["metadata", "page", "format"], event.currentTarget.value as CoverLetterPage["format"], false)}
          {...fieldProps(["metadata", "page", "format"])}
        >
          {PAGE_OPTIONS.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
        </NativeSelect>
        <p className="cover-letter-page-help">{PAGE_OPTIONS.find((option) => option.value === page.format)?.detail}. Page breaks follow the selected print size.</p>
      </Field>
      <div className="cover-letter-page-margin-grid">
        <Field label="Horizontal margin">
          <div className="cover-letter-page-number-input"><Input type="number" min={0} max={60} step={1} value={page.marginX} onChange={(event) => updateMargin(["metadata", "page", "marginX"], event.currentTarget.value)} {...fieldProps(["metadata", "page", "marginX"])} /><span>mm</span></div>
        </Field>
        <Field label="Vertical margin">
          <div className="cover-letter-page-number-input"><Input type="number" min={0} max={60} step={1} value={page.marginY} onChange={(event) => updateMargin(["metadata", "page", "marginY"], event.currentTarget.value)} {...fieldProps(["metadata", "page", "marginY"])} /><span>mm</span></div>
        </Field>
      </div>
      <p className="cover-letter-page-help">The editor shows the printable area and keeps paragraph blocks inside these margins when a page breaks.</p>
    </>
  )
}

function AddressFields({ prefix, address, update, fieldProps }: FieldHelpers & { prefix: Path; address: CoverLetterData["applicant"]["address"] }) {
  return <div className="cover-letter-address-fields"><h3>Address <span>(optional)</span></h3>{(["street", "street2", "city", "state", "postalCode", "country"] as const).map((key) => <StringInput key={key} label={titleCase(key)} path={[...prefix, key]} value={address?.[key] ?? ""} update={update} fieldProps={fieldProps} nullable />)}</div>
}

function setAtPath(letter: CoverLetterData, path: Path, value: unknown): CoverLetterData {
  const next = structuredClone(letter) as unknown as Record<string, unknown>
  let cursor: unknown = next
  for (let index = 0; index < path.length - 1; index += 1) {
    cursor = Array.isArray(cursor) ? cursor[path[index] as number] : (cursor as Record<string, unknown>)[path[index] as string]
  }
  const last = path[path.length - 1]
  if (Array.isArray(cursor)) cursor[last as number] = value
  else (cursor as Record<string, unknown>)[last as string] = value
  return next as unknown as CoverLetterData
}

function pathKey(path: Path) { return path.map(String).join(".") }
function titleCase(value: string) { return value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase()) }
