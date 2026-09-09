import { test, expect } from "@playwright/test"
import { existsSync, readFileSync, writeFileSync } from "node:fs"

test("live creation outputs retain their text and fit the actual document renderer", async ({ page }) => {
  test.skip(!process.env.MUTTJOBS_EVAL_LAYOUT, "Explicit layout evaluation of local live-provider artifacts")
  test.setTimeout(120_000)
  const files = ["src-tauri/target/document-creation-evaluation.json", "src-tauri/target/document-creation-evaluation-claude.json"]
  const reports = files.filter(existsSync).flatMap((path) => JSON.parse(readFileSync(path, "utf8")))
  expect(reports.length).toBeGreaterThan(0)
  await page.goto("/")
  const measurements = []
  for (const [index, report] of reports.entries()) {
    if (!report.completed) continue
    const session = report.sessions.at(-1)
    await page.evaluate(async ({ draft, artifact }) => {
      const fixture = await import(/* @vite-ignore */ "/tests/browser/document-layout-fixture.tsx")
      fixture.renderDocument(draft, artifact)
    }, { draft: session.draft, artifact: session.artifact })
    const preview = page.locator("#live-layout-fixture")
    await expect(preview.locator("[data-page-count]")).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(1000)
    const measurement = await preview.evaluate((element) => {
      const sheet = element.querySelector<HTMLElement>("[data-page-count]")!
      return {
        pages: Number(sheet.dataset.pageCount),
        clipped: sheet.scrollWidth > sheet.clientWidth + 2 || !!sheet.querySelector(".resume-page-break.is-content-cut"),
        text: sheet.innerText,
      }
    })
    for (const passage of session.passages) {
      expect(measurement.text.replace(/\s+/g, " ")).toContain(passage.text.replace(/\s+/g, " "))
    }
    expect(measurement.clipped, report.case).toBe(false)
    expect(measurement.pages, report.case).toBeGreaterThanOrEqual(1)
    expect(measurement.pages, report.case).toBeLessThanOrEqual(session.pageMode === "two" ? 2 : 1)
    await preview.screenshot({ path: `test-results/live-document-${index + 1}.png` })
    measurements.push({ case: report.case, provider: session.provider, artifact: session.artifact, pages: measurement.pages, clipped: measurement.clipped, textRetained: true })
  }
  writeFileSync("test-results/document-creation-layout.json", JSON.stringify(measurements, null, 2))
})
