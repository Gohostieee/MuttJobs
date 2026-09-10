import { test, expect } from "@playwright/test"
import { writeFileSync } from "node:fs"

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:1439/reset")
  await page.addInitScript(() => {
    const target = window as unknown as { __TAURI_INTERNALS__: object }
    target.__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: unknown) => {
        const response = await fetch("http://127.0.0.1:1439/command", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command, args }),
        })
        const result = await response.json()
        if (!result.ok) throw result.error
        return result.value
      },
      transformCallback: () => 1,
      unregisterCallback: () => {},
      convertFileSrc: (path: string) => path,
    }
  })
  await page.goto("/")
})

for (const format of ["letter", "a4"] as const) for (const bullets of [1, 55]) {
  test(`Export PDF retains ${bullets === 1 ? "one page" : "both pages"} on ${format}`, async ({ page }, testInfo) => {
    await page.evaluate(async ({ format, bullets }) => {
      const { loadResumes, saveResume } = await import("/src/lib/resume-storage.ts")
      const file = (await loadResumes())[0]
      file.data.basics.name = "PDF Export Fixture"
      file.data.metadata.page.format = format
      file.data.sections.experience.items[0].description = `<ul>${Array.from({ length: bullets }, (_, index) => `<li>Export evidence ${String(index + 1).padStart(2, "0")}: Built reliable systems and supported the team.</li>`).join("")}</ul>`
      await saveResume(file, file.data)
    }, { format, bullets })
    await page.getByRole("button", { name: "Resumes", exact: true }).click()
    await page.getByRole("button", { name: "Open fixture-resume", exact: true }).click()
    const cdp = await page.context().newCDPSession(page)
    let pdf: Buffer | undefined
    await page.exposeBinding("exportFixturePdf", async () => {
      // Same print engine and parameters as the Windows Page.printToPDF command.
      const result = await cdp.send("Page.printToPDF", {
        displayHeaderFooter: false, printBackground: true, preferCSSPageSize: true,
        marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, generateTaggedPDF: true,
      })
      pdf = Buffer.from(result.data, "base64")
      writeFileSync(testInfo.outputPath("multipage-resume.pdf"), pdf)
    })
    await page.evaluate(() => {
      const bridge = window.__TAURI_INTERNALS__
      const invoke = bridge.invoke
      bridge.invoke = async (command, args) => {
        if (command === "plugin:dialog|save") return "fixture-export.pdf"
        if (command === "export_resume_pdf") return window.exportFixturePdf()
        return invoke(command, args)
      }
    })
    await page.getByRole("button", { name: "Export PDF", exact: true }).click()
    await expect(page.getByRole("button", { name: "Exported", exact: true })).toBeVisible()
    expect(pdf).toBeDefined()
    const pages = pdf!.toString("latin1").match(/\/Type\s*\/Page\b/g) || []
    expect(pages.length).toBe(bullets === 1 ? 1 : 2)
  })

}
