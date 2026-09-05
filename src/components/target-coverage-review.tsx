import { useState } from "react"
import { Button } from "./ui/button"
import type { Target } from "@/lib/job-workspace"
export function TargetCoverageReview({
  target,
  disabled,
  onReview,
}: {
  target: Target
  disabled: boolean
  onReview: (
    criteria: { criterionIndex: number; alternatives: number[] }[],
  ) => void
}) {
  const [choices, setChoices] = useState<Record<number, number[]>>({})
  return (
    <div className="target-edit-form">
      {target.criteria.map((criterion, index) => (
        <fieldset key={index}>
          <legend>
            {criterion.label} · {criterion.relationship}
          </legend>
          <small>
            Select only alternatives supported by the linked evidence and this
            saved passage.
          </small>
          {criterion.alternatives.map((alternative, option) => (
            <label key={option} className="criterion-choice">
              <input
                type="checkbox"
                checked={(choices[index] || []).includes(option)}
                disabled={disabled}
                onChange={(event) =>
                  setChoices((current) => ({
                    ...current,
                    [index]: event.target.checked
                      ? [...(current[index] || []), option]
                      : (current[index] || []).filter((i) => i !== option),
                  }))
                }
              />
              {alternative}
            </label>
          ))}
        </fieldset>
      ))}
      <Button
        size="sm"
        disabled={disabled}
        onClick={() =>
          onReview(
            Object.entries(choices).map(([index, alternatives]) => ({
              criterionIndex: Number(index),
              alternatives,
            })),
          )
        }
      >
        Confirm addressed
      </Button>
    </div>
  )
}
