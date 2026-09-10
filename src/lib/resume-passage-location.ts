export type ResumePassage = { field: string; quote: string }

const normalize = (value: string) => value.replace(/\s+/g, " ").trim()

// Decorations belong to the current check, never to saved resume content.
export function markResumeBulletCoverage(root: HTMLElement, matchedElements: HTMLElement[]) {
  const bullets = Array.from(root.querySelectorAll<HTMLElement>("[data-resume-field] li"))
    .filter(bullet => normalize(bullet.textContent || ""))
  const matched = new Set(matchedElements.flatMap(element => {
    const bullet = element.closest<HTMLElement>("li")
    return bullet && root.contains(bullet) ? [bullet] : []
  }))
  bullets.forEach(bullet => { bullet.dataset.targetCoverage = matched.has(bullet) ? "matched" : "unmatched" })
  return () => bullets.forEach(bullet => bullet.removeAttribute("data-target-coverage"))
}

// Match only within the cited field. Identical text in another job is not evidence.
export function locateResumePassage(root: HTMLElement, passage: ResumePassage) {
  const field = Array.from(root.querySelectorAll<HTMLElement>("[data-resume-field]"))
    .find(element => element.dataset.resumeField === passage.field)
  if (!field) return []
  const quote = normalize(passage.quote)
  if (!quote) return []
  const blocks = Array.from(field.querySelectorAll<HTMLElement>("li, p"))
  const matches = blocks.filter(element => {
    const text = normalize(element.innerText || element.textContent || "")
    return text && (text.includes(quote) || quote.includes(text))
  }).filter(element => !blocks.some(child => child !== element && element.contains(child) && normalize(child.textContent || "").includes(quote)))
  const elements = matches.length ? matches : normalize(field.innerText || field.textContent || "").includes(quote) ? [field] : []
  const item = field.closest<HTMLElement>("[data-resume-item-index]")
  const section = field.closest<HTMLElement>("[data-section-key]")
  const heading = item?.querySelector("h3")?.textContent?.trim()
  const sectionName = section?.dataset.sectionKey || passage.field.split("/")[1] || "Resume"
  const owner = heading || `${sectionName}${item ? ` · Entry ${Number(item.dataset.resumeItemIndex) + 1}` : ""}`
  return elements.map(element => ({
    element,
    label: `${owner} · ${element.tagName === "LI" ? `Bullet ${Array.from(field.querySelectorAll<HTMLElement>("li")).indexOf(element) + 1}` : "Text field"}`,
  }))
}
