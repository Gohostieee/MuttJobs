import type { JobPreparation, Target } from "./job-workspace"

function targetSignature(target: Target) {
  return JSON.stringify([
    target.id,
    target.title,
    target.interpretation,
    target.category,
    target.requirementClass,
    target.priority,
    target.grounding,
    target.rationale,
    target.sources.map((s) => [s.paragraphId, s.quote, s.occurrence]),
    target.evidenceExpectations,
    target.criteria.map((c) => [
      c.label,
      c.relationship,
      c.alternatives,
      c.minimum,
      c.unit,
    ]),
  ])
}

export function requirementConfirmed(
  workspace: JobPreparation,
  target: Target,
) {
  const saved = workspace.confirmedTargets?.[target.id]
  return (
    saved?.sourceRevision === workspace.source.revision &&
    targetSignature(saved.target) === targetSignature(target)
  )
}
