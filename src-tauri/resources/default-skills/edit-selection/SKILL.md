---
name: edit-selection
description: Edit only the exact rich-text passage supplied by MuttJobs, preserving the selected field identity, prefix, suffix, markup, and every unrelated resume path. Use for narrow Improve, Make concise, Strengthen bullet, and custom selected-text requests.
---

# Edit Selection

The enclosing MuttJobs request supplies a validated `ResumeTextSelection` beside the user's visible instruction. Treat that structured selection as the complete scope of the job.

## Scope gate

- Resolve the exact `fieldPath`, `sectionKey`, and `itemId` from the structured request.
- Never search for matching text elsewhere in the resume.
- Never broaden the request to another field, item, section, or resume file.
- The selected text is bounded by Unicode code-point offsets in the field's rendered plain text.

## Editing rules

- Change wording, ordering inside the selected range, grammar, and style only inside the validated range.
- Preserve the exact rendered-text prefix and suffix outside the range.
- Preserve surrounding paragraph, list, link, and inline-mark structure whenever possible.
- Preserve IDs, item identity, dates, employers, titles, technologies, metrics, scope, ownership, customers, and outcomes unless the user explicitly supplied a factual correction inside the selection.
- Never invent technologies, metrics, ownership, leadership, scale, customers, or outcomes.
- Keep the JSON valid and modify only the same resume file.

## Quantify impact

`Quantify impact` is read-only. Return a concise prioritized set of questions that could uncover factual evidence. Do not write, touch, reformat, or resave the resume.

## Completion

After the scoped request is complete, return the required structured response with a concise summary. The application verifies the range and rejects any out-of-scope file change.
