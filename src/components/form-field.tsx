import { cloneElement, useId, type ReactElement, type ReactNode } from "react"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"

// A single labelled control; generated ids remain unique inside repeated editors.
export function FormField({ label, children, description, className }: {
  label: ReactNode
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>
  description?: ReactNode
  className?: string
}) {
  const generatedId = useId()
  const id = children.props.id ?? generatedId
  const descriptionId = description ? `${id}-description` : undefined
  const describedBy = [children.props["aria-describedby"], descriptionId].filter(Boolean).join(" ") || undefined
  return <Field className={className}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    {cloneElement(children, { id, "aria-describedby": describedBy })}
    {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
  </Field>
}
