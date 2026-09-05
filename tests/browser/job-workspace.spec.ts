import { test, expect, type Page } from "@playwright/test"

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
async function openJob(page: Page) {
  await page
    .getByRole("button", { name: /Systems Engineer Fixture Company/ })
    .click()
  await expect(
    page.getByRole("heading", { name: "What this role asks of you" }),
  ).toBeVisible()
}
async function analyze(page: Page) {
  await openJob(page)
  await page.getByRole("button", { name: "Analyze job", exact: true }).click()
  await expect(
    page.getByRole("button", {
      name: /Demonstrate reliable service development/,
    }),
  ).toBeVisible()
}
async function inspect(page: Page) {
  await page
    .getByRole("button", { name: /Demonstrate reliable service development/ })
    .click()
}
test("opening Applications and navigating does not invoke a provider", async ({
  page,
  request,
}) => {
  await expect(
    page.getByRole("region", { name: "Applications list" }),
  ).toBeVisible()
  await openJob(page)
  await page.getByRole("button", { name: "Original source" }).click()
  await expect(page.getByLabel("Current posting")).toContainText(
    "Build reliable services",
  )
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await page.getByRole("button", { name: "Documents", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Systems Engineer" }),
  ).toBeVisible()
  const stats = await request.post("http://127.0.0.1:1439/command", {
    data: { command: "stats", args: {} },
  })
  expect((await stats.json()).value.providerRuns).toBe(0)
})
test("analysis preserves alternatives and returns to the same target after restart", async ({
  page,
}) => {
  await analyze(page)
  await inspect(page)
  await expect(page.getByText("any-of: React / Vue / Angular")).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole("heading", {
      name: "Demonstrate reliable service development",
    }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Applications", exact: true })
    .last()
    .click()
  await expect(page.getByText("1 high-priority unresolved")).toBeVisible()
})
test("supported document proposal requires acceptance and a separate coverage review", async ({
  page,
}) => {
  await analyze(page)
  await page
    .getByRole("button", { name: "Match Career Profile", exact: true })
    .click()
  await inspect(page)
  await page.getByRole("button", { name: "Confirm evidence" }).click()
  await page.getByRole("button", { name: "Documents", exact: true }).click()
  await page.getByRole("button", { name: "Prepare targeted proposal" }).click()
  await page.getByRole("button", { name: "Review proposal" }).click()
  await expect(
    page
      .getByRole("dialog")
      .getByText("Built reliable event-driven services with Vue.", {
        exact: true,
      }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Accept document" }).click()
  await page.getByRole("button", { name: "Targets", exact: true }).click()
  await expect(page.getByLabel("Preparation summary")).toContainText("0/1")
  await page.getByRole("checkbox", { name: "Vue", exact: true }).check()
  await page.getByRole("button", { name: "Confirm addressed" }).click()
  await expect(page.getByLabel("Preparation summary")).toContainText("1/1")
  await page.reload()
  await expect(page.getByLabel("Preparation summary")).toContainText("1/1")
})
test("narrow inspector is accessible and returns keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 })
  await analyze(page)
  const row = page.getByRole("button", {
    name: /Demonstrate reliable service development/,
  })
  await row.focus()
  await page.keyboard.press("Enter")
  await expect(
    page.getByRole("dialog", { name: "Target inspector" }),
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(row).toBeFocused()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  )
  expect(overflow).toBe(false)
  await page.screenshot({
    path: "test-results/workspace-narrow.png",
    fullPage: true,
  })
})
test("board and list share preparation counts", async ({ page }) => {
  await analyze(page)
  await page
    .getByRole("button", { name: "Applications", exact: true })
    .last()
    .click()
  await expect(page.getByText("1 high-priority unresolved")).toBeVisible()
  await page.getByRole("button", { name: "Board", exact: true }).click()
  await expect(
    page.getByRole("region", { name: "Application board" }),
  ).toContainText("1 high-priority unresolved")
  await page.getByRole("button", { name: "List", exact: true }).click()
  await page.screenshot({
    path: "test-results/applications-list.png",
    fullPage: true,
  })
})

test("typed editor storage advances revisions and rejects an older snapshot", async ({
  page,
}) => {
  await openJob(page)
  const result = await page.evaluate(async () => {
    const workspaceModule = "/src/lib/job-workspace.ts"
    const storageModule = "/src/lib/resume-storage.ts"
    const { readJobWorkspace, mutateJobWorkspace } = await import(
      workspaceModule
    )
    const { loadJobPrimaryResume, saveResume } = await import(storageModule)
    await mutateJobWorkspace(await readJobWorkspace(1), "createDraft", {
      artifact: "resume",
    })
    const original = await loadJobPrimaryResume(1)
    const firstData = structuredClone(original.data)
    firstData.basics.name = "First saved name"
    const first = await saveResume(original, firstData, { jobId: 1 })
    const secondData = structuredClone(first.data)
    secondData.basics.name = "Second saved name"
    const second = await saveResume(first, secondData, { jobId: 1 })
    let rejected = false
    try {
      await saveResume(original, firstData, { jobId: 1 })
    } catch {
      rejected = true
    }
    const current = await loadJobPrimaryResume(1)
    return {
      rejected,
      name: current.data.basics.name,
      revisionsChanged:
        original.revision !== first.revision &&
        first.revision !== second.revision,
    }
  })
  expect(result).toEqual({
    rejected: true,
    name: "Second saved name",
    revisionsChanged: true,
  })
})
