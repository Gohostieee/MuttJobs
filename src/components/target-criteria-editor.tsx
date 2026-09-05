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
    <details>
      <summary>Classification and supporting criteria</summary>
      <label>
        Category
        <input
          value={target.category}
          onChange={(event) =>
            onChange({ ...target, category: event.target.value })
          }
        />
      </label>
      <label>
        Requirement class
        <select
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
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        Interpretation rationale
        <textarea
          value={target.rationale}
          onChange={(event) =>
            onChange({ ...target, rationale: event.target.value })
          }
        />
      </label>
      {target.criteria.map((criterion, index) => (
        <fieldset key={index}>
          <label>
            Criterion
            <input
              value={criterion.label}
              onChange={(event) => update(index, { label: event.target.value })}
            />
          </label>
          <label>
            Relationship
            <select
              value={criterion.relationship}
              onChange={(event) =>
                update(index, { relationship: event.target.value })
              }
            >
              {["all-of", "any-of", "example-tool", "optional"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Alternatives (one per line)
            <textarea
              value={criterion.alternatives.join("\n")}
              onChange={(event) =>
                update(index, { alternatives: event.target.value.split("\n") })
              }
            />
          </label>
          <label>
            Stated minimum
            <input
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
            />
          </label>
          <label>
            Unit
            <input
              value={criterion.unit ?? ""}
              onChange={(event) =>
                update(index, { unit: event.target.value || null })
              }
            />
          </label>
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
        </fieldset>
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
    </details>
  )
}
