import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { FieldSet, FieldLegend } from "@/components/ui/field"
import { ChevronDown } from "lucide-react"
import { FormField } from "@/components/form-field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import type { Target } from "@/lib/job-workspace"
import { Button } from "./ui/button"

export function TargetCriteriaEditor({
  target,
  onChange,
}: {
  target: Target
  onChange: (target: Target) => void
}) {
  const update = (index: number, patch: Partial<Target["criteria"][number]>) =>
    onChange({
      ...target,
      criteria: target.criteria.map((criterion, i) =>
        i === index ? { ...criterion, ...patch } : criterion,
      ),
    })
  return (
    <Collapsible>
      <CollapsibleTrigger asChild><Button variant="outline" className="w-full justify-between whitespace-normal">Classification and supporting criteria<ChevronDown /></Button></CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 pt-4">
      <FormField label="Category"><Input
          value={target.category}
          onChange={(event) =>
            onChange({ ...target, category: event.target.value })
          }
        /></FormField>
      <FormField label="Requirement class"><NativeSelect
          value={target.requirementClass}
          onChange={(event) =>
            onChange({ ...target, requirementClass: event.target.value })
          }
        >
          {[
            "Required qualification",
            "Core responsibility",
            "Preferred qualification",
            "Contextual signal",
            "Unclear",
          ].map((value) => (
            <NativeSelectOption key={value}>{value}</NativeSelectOption>
          ))}
        </NativeSelect></FormField>
      <FormField label="Interpretation rationale"><Textarea
          value={target.rationale}
          onChange={(event) =>
            onChange({ ...target, rationale: event.target.value })
          }
        /></FormField>
      {target.criteria.map((criterion, index) => (
        <FieldSet key={index} className="border-t pt-4"><FieldLegend variant="label">Criterion {index + 1}</FieldLegend>
          <FormField label="Criterion"><Input
              value={criterion.label}
              onChange={(event) => update(index, { label: event.target.value })}
            /></FormField>
          <FormField label="Relationship"><NativeSelect
              value={criterion.relationship}
              onChange={(event) =>
                update(index, { relationship: event.target.value })
              }
            >
              {["all-of", "any-of", "example-tool", "optional"].map((value) => (
                <NativeSelectOption key={value}>{value}</NativeSelectOption>
              ))}
            </NativeSelect></FormField>
          <FormField label="Alternatives (one per line)"><Textarea
              value={criterion.alternatives.join("\n")}
              onChange={(event) =>
                update(index, { alternatives: event.target.value.split("\n") })
              }
            /></FormField>
          <FormField label="Stated minimum"><Input
              type="number"
              min="0"
              value={criterion.minimum ?? ""}
              onChange={(event) =>
                update(index, {
                  minimum:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            /></FormField>
          <FormField label="Unit"><Input
              value={criterion.unit ?? ""}
              onChange={(event) =>
                update(index, { unit: event.target.value || null })
              }
            /></FormField>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...target,
                criteria: target.criteria.filter((_, i) => i !== index),
              })
            }
          >
            Remove criterion
          </Button>
        </FieldSet>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          onChange({
            ...target,
            criteria: [
              ...target.criteria,
              {
                label: "",
                relationship: "all-of",
                alternatives: [""],
                minimum: null,
                unit: null,
              },
            ],
          })
        }
      >
        Add criterion
      </Button>
    </CollapsibleContent></Collapsible>
  )
}
