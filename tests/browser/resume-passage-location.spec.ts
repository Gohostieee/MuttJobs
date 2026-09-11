import { test, expect } from "@playwright/test"

test("bullet coverage counts distinct targets and clears all three colors", async ({ page }) => {
  await page.goto("/")
  const result = await page.evaluate(async () => {
    const { markResumeBulletCoverage } = await import("/src/lib/resume-passage-location.ts")
    const root = document.createElement("div")
    root.className = "resume-viewer-content"
    root.innerHTML = `<aside class="resume-target-links"></aside><div class="resume-viewport"><div data-resume-field="/summary/content"><ul><li>Shared <strong>evidence</strong></li><li>Unique evidence</li><li>Uncovered</li></ul></div></div>`
    document.body.append(root)
    const bullets = Array.from(root.querySelectorAll("li"))
    const clear = markResumeBulletCoverage(root, [
      { element: bullets[0], targetId: "a" },
      { element: bullets[0].querySelector("strong")!, targetId: "b" },
      { element: bullets[1], targetId: "c" },
      { element: bullets[1], targetId: "c" },
    ])
    const states = bullets.map(bullet => bullet.dataset.targetCoverage)
    const colors = bullets.map(bullet => getComputedStyle(bullet).backgroundColor)
    clear()
    const remaining = root.querySelectorAll("[data-target-coverage]").length
    root.remove()
    return { states, colors, remaining }
  })
  expect(result.states).toEqual(["redundant", "matched", "unmatched"])
  expect(result.colors).toEqual(["rgba(234, 179, 8, 0.24)", "rgba(22, 163, 74, 0.16)", "rgba(220, 38, 38, 0.14)"])
  expect(result.remaining).toBe(0)
})

test("passage links isolate bullets within the owning experience and preserve plain fields", async ({ page }) => {
  await page.goto("/")
  const result = await page.evaluate(async () => {
    const { locateResumePassage } = await import("/src/lib/resume-passage-location.ts")
    const root = document.createElement("div")
    root.innerHTML = `<section data-section-key="experience"><article data-resume-item-index="0"><h3>Engineer</h3><div data-resume-field="/sections/experience/items/0/description"><ul><li>Built <strong>reliable</strong> services.</li><li>Mentored engineers.</li></ul></div></article><article data-resume-item-index="1"><div data-resume-field="/sections/experience/items/1/description"><ul><li>Built reliable services.</li></ul></div></article></section><div data-resume-field="/summary/content"><p>Software engineer.</p></div>`
    const find = (field: string, quote: string) => locateResumePassage(root, { field, quote }).map(location => ({ text: location.element.textContent, tag: location.element.tagName, label: location.label }))
    return {
      bullet: find("/sections/experience/items/0/description", "Built reliable services."),
      second: find("/sections/experience/items/0/description", "Mentored engineers."),
      missing: find("/sections/experience/items/1/description", "Mentored engineers."),
      plain: find("/summary/content", "Software engineer."),
      deleted: find("/sections/experience/items/2/description", "Built reliable services."),
    }
  })
  expect(result.bullet).toEqual([{ text: "Built reliable services.", tag: "LI", label: "Engineer · Bullet 1" }])
  expect(result.second[0].label).toBe("Engineer · Bullet 2")
  expect(result.missing).toEqual([])
  expect(result.deleted).toEqual([])
  expect(result.plain[0].tag).toBe("P")
})
