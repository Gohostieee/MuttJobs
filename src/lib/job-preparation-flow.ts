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

export function targetProgress(
  workspace: JobPreparation,
  target: Target,
  artifact = "resume",
) {
  const confirmed = requirementConfirmed(workspace, target)
  const evidence = workspace.evidence.filter(
    (e) => e.suggestion.targetId === target.id,
  )
  const usable = evidence.filter((e) => e.review !== "Rejected")
  const supported = usable.some(
    (e) =>
      ["Strong", "Partial"].includes(e.suggestion.strength) &&
      e.suggestion.references.length > 0,
  )
  const approved = usable.some(
    (e) =>
      e.review === "Confirmed" &&
      ["Strong", "Partial"].includes(e.suggestion.strength) &&
      e.suggestion.references.length > 0,
  )
  const coverage = workspace.coverage.filter(
    (c) => c.placement.targetId === target.id && c.artifact === artifact,
  )
  const addressed = coverage.some((c) => c.status === "Addressed")
  const status = !confirmed
    ? "Confirm requirement"
    : addressed
      ? "Addressed in document"
      : coverage.length
        ? "Review document coverage"
        : approved
          ? "Ready for document"
          : evidence.some((e) => e.review === "Needs review")
            ? "Evidence needs another review"
            : supported
              ? "Review suggested evidence"
              : evidence.length
                ? "Add profile details"
                : "Ready to match"
  return { confirmed, evidence, supported, approved, addressed, status }
}
