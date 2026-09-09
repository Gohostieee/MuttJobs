function passages(value: unknown, parentKey = ""): string[] {
  if (!value || typeof value !== "object") return []
  const result: string[] = []
  for (const [key, child] of Object.entries(value)) {
    if (["metadata", "picture", "profile"].includes(key)) continue
    if (typeof child === "string" && (parentKey === "body" || ["content", "description", "opening", "closingParagraph", "company", "position", "name", "school", "degree", "period"].includes(key))) {
      const parsed = new DOMParser().parseFromString(child, "text/html")
      const blocks = parsed.querySelectorAll("p,li")
      result.push(...(blocks.length ? [...blocks].map((block) => block.textContent ?? "") : [parsed.body.textContent ?? ""]).filter((text) => text.trim()))
    } else if (child && typeof child === "object") result.push(...passages(child, key))
  }
  return result
}

export function DocumentProposalChanges({ before, after }: { before: unknown; after: unknown }) {
  const oldText = new Set(passages(before))
  const newText = new Set(passages(after))
  const added = [...newText].filter((text) => !oldText.has(text))
  const removed = [...oldText].filter((text) => !newText.has(text))
  return <details>
    <summary>{added.length} additions · {removed.length} removals</summary>
    {added.length > 0 && <><h4>Added or revised</h4><ul>{added.map((text) => <li key={text}>{text}</li>)}</ul></>}
    {removed.length > 0 && <><h4>Removed or replaced</h4><ul>{removed.map((text) => <li key={text}>{text}</li>)}</ul></>}
  </details>
}
