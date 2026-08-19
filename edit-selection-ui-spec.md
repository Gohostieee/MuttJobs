# MuttJobs Edit Selection UI Specification

Status: deferred implementation specification  
Scope: selection capture, inline skill actions, request plumbing, and validation for a future `edit-selection` skill  
Out of scope for the current production-skills release: UI changes, public types, Tauri commands, worker changes, and the `edit-selection` skill folder

## 1. Goal

Allow a user to select text inside a supported rich-text resume field and invoke the narrowest possible AI action. The future implementation must bind the request to a stable resume field and exact text range so the agent cannot edit outside the selection.

Supported fields:

- `summary.content`
- Experience, project, education, award, certification, publication, volunteer, reference, cover-letter, summary-item, and custom-section rich-text `description` or `content` fields

Excluded fields:

- Names, employers, positions, schools, degrees, titles, issuers, dates, periods, locations, contact details, URLs, IDs, and design/layout metadata

## 2. User experience

When a non-collapsed selection remains entirely inside one supported `RichTextEditor`:

1. Show a compact anchored toolbar after pointer or keyboard selection settles.
2. Offer `Improve`, `Make concise`, `Strengthen bullet`, `Quantify impact`, and `Edit with instruction...`.
3. Preserve the visual selection while the toolbar receives focus.
4. Route `Edit with instruction...` to the Resume AI sidebar with the target context attached; do not paste hidden metadata into visible prompt text.
5. Close the toolbar on Escape, collapsed selection, editor blur to an unrelated control, field change, or resume change.
6. Restore focus and selection after canceling an action.

Keyboard behavior:

- Make the toolbar reachable after a keyboard selection without requiring a pointer.
- Use roving focus or conventional toolbar arrow-key navigation.
- Escape returns focus to the editor and restores the selection.
- Announce the selected action and busy/error states through an ARIA live region.

On narrow/mobile layouts, render the actions as an anchored sheet or compact menu that does not cover the selected text when avoidable.

## 3. Future interface

Document, then introduce, this type only when implementation begins:

```ts
export type ResumeTextSelection = {
  fieldPath: Array<string | number>
  sectionKey: string
  itemId?: string
  selectedText: string
  startOffset: number
  endOffset: number
  fieldContentHash: string
  htmlFragment?: string
}
```

Rules:

- Normalize offsets as Unicode code-point offsets into the field's rendered plain text, with `startOffset < endOffset`.
- Normalize `selectedText` from the same rendered-text traversal used to calculate offsets.
- Include `itemId` whenever the field belongs to an item. Never rely on an array index alone for item identity.
- Compute `fieldContentHash` from the exact sanitized HTML stored for the field, encoded as lowercase SHA-256 hex.
- Limit selected plain text to 4,000 Unicode code points. Reject a larger selection with a user-facing instruction to select a smaller passage.
- Include `htmlFragment` only when the range contains meaningful inline or block markup; sanitize it before transport.

## 4. DOM range mapping

Add selection reporting to `RichTextEditor` rather than querying arbitrary document selection from the sidebar.

1. Confirm the browser `Selection` has one non-collapsed range.
2. Confirm both endpoints are descendants of the current editor root.
3. Walk text nodes in document order using the same block-boundary rules used to derive rendered text.
4. Convert the DOM endpoints to normalized plain-text offsets.
5. Serialize and sanitize the selected fragment.
6. Reconstruct `selectedText` from the offsets and verify it equals the normalized browser selection.
7. Emit the field path and stable item context supplied by `ResumeDocument`.

Selections spanning multiple editors or unsupported field boundaries are invalid. Selections spanning links, paragraphs, or list items are valid only when both endpoints remain in the same persisted field. Preserve the surrounding block/list structure when replacing a valid range.

## 5. Data flow

```text
RichTextEditor DOM Selection
  -> ResumeTextSelection candidate
  -> ResumeDocument attaches fieldPath/sectionKey/itemId
  -> ResumeWorkspace owns active selection
  -> Inline action or ResumeAiSidebar submits selection context
  -> Tauri validates path, item ID, hash, offsets, and selected text
  -> future edit-selection execution returns a scoped proposal
  -> application validates and applies only the selected field/range
```

`RichTextEditor` should gain a selection callback. `ResumeDocument` should already know the persisted field path; extend its edit context so it can attach the section key and stable item ID. `ResumeWorkspace` should be the single owner shared by the document and sidebar.

The future request must carry structured selection data beside the visible user prompt. Do not encode the path, hash, offsets, or HTML as user-authored prompt syntax.

## 6. Validation and stale selections

Before execution, Tauri must:

1. Canonicalize the resume file using the existing resumes-directory restriction.
2. Resolve `fieldPath` against the current JSON.
3. Confirm the path is on the supported rich-text allowlist.
4. Confirm the resolved item's ID equals `itemId` when one is supplied.
5. Sanitize the current field HTML and recompute its SHA-256 hash.
6. Reject the request when the hash differs.
7. Derive current plain text, validate offset boundaries, and confirm the slice equals `selectedText`.

Use this stale-selection error: `The selected resume text changed. Select it again and retry.`

Never silently relocate a stale selection by searching for matching text because duplicate passages can target the wrong claim.

## 7. Mutation boundary

The future skill may change wording, ordering, grammar, and style only inside the validated selected range. It may not broaden factual scope or introduce unsupported technologies, metrics, ownership, leadership, scale, customers, or outcomes.

The application, not the model, must verify:

- The response targets the same field path.
- The replacement changes only the validated range.
- Prefix and suffix content remain identical.
- The resulting HTML sanitizes successfully.
- Protected fields and every other JSON path remain unchanged.

`Quantify impact` is read-only and should return questions without creating a replacement.

## 8. Failure handling

- Collapsed or empty selection: do not show the toolbar.
- Cross-field selection: hide the toolbar and make no request.
- Unsupported field: do not show selection actions.
- Stale hash or text: reject and require reselection.
- Sanitization changes the selected fragment materially: reject before execution.
- Agent returns an out-of-range edit: reject it and preserve the resume.
- Save conflict or resume replacement: clear the active selection.
- Provider change to Claude Code: preserve any visible draft but disable the Codex-only skill action with the existing provider message.

## 9. Acceptance tests

- Map forward and backward keyboard selections to the same normalized offsets.
- Capture selections inside one paragraph, across inline marks, across a link, across list items, and across paragraphs in one field.
- Reject selections spanning two persisted fields.
- Restore focus and selection after Escape and canceled custom instruction.
- Clear the selection when the field content changes.
- Reject a stale content hash even when identical text exists elsewhere.
- Reject mismatched item IDs and protected paths.
- Confirm a replacement preserves the exact prefix, suffix, unrelated JSON, IDs, metadata, and sanitized markup.
- Confirm `Quantify impact` performs no write.
- Confirm the toolbar and sidebar flow are keyboard and screen-reader accessible.
- Confirm mobile actions remain operable without obscuring the selection.

## 10. Deferred work

Do not implement this specification in the production-skills release. Do not add `ResumeTextSelection`, selection callbacks, request parameters, Tauri validation, worker protocol fields, or an `edit-selection` skill until a later explicitly scoped implementation.
