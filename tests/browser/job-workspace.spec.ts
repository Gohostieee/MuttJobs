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
      name: "Demonstrate reliable service development",
      exact: true,
    }),
  ).toBeVisible()
}
async function inspect(page: Page) {
  await page
    .getByRole("button", {
      name: "Demonstrate reliable service development",
      exact: true,
    })
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
  await page.getByText("Job details", { exact: true }).click()
  await page.getByRole("button", { name: "Original source" }).click()
  await expect(page.getByLabel("Current posting")).toContainText(
    "Build reliable services",
  )
  await page.getByRole("button", { name: "Close", exact: true }).click()
  await page.getByRole("button", { name: /Documents$/ }).click()
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
  if (await page.getByRole("dialog").count())
    await page.keyboard.press("Escape")
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
  await expect(
    page.getByRole("button", { name: "Continue to matching" }),
  ).toBeDisabled()
  await page.getByRole("button", { name: /^Confirm requirement:/ }).click()
  await expect(page.getByLabel("Current preparation step")).toContainText(
    "1 of 1 requirements confirmed",
  )
  await page.reload()
  await expect(page.getByLabel("Current preparation step")).toContainText(
    "1 of 1 requirements confirmed",
  )
  await page.getByRole("button", { name: "Continue to matching" }).click()
  await page.screenshot({
    path: "test-results/preparation-ready.png",
    fullPage: true,
  })
  let finishMatch!: () => void
  const matchingPaused = new Promise<void>((resolve) => {
    finishMatch = resolve
  })
  await page.route("http://127.0.0.1:1439/command", async (route) => {
    const input = route.request().postDataJSON()
    if (
      input.command === "job_workspace_run" &&
      input.args.request.operation === "match"
    )
      await matchingPaused
    await route.continue()
  })
  await page
    .getByRole("button", { name: "Match Career Profile", exact: true })
    .click()
  await expect(page.locator(".target-row")).toHaveAttribute(
    "data-state",
    "matching",
  )
  await expect(page.locator(".target-state")).toHaveText("Matching profile...")
  const reasoning = page.getByRole("region", { name: "Job match progress" })
  await reasoning.getByRole("button", { name: /View live reasoning/ }).click()
  await expect(reasoning.getByText("Reasoning and activity appear here as the provider sends them.")).toBeVisible()
  finishMatch()
  await expect(page.locator(".target-row")).toHaveAttribute(
    "data-state",
    "review",
  )
  await expect(page.locator(".target-match-excerpt")).toContainText(
    "Built reliable event-driven services with Vue.",
  )
  await page.screenshot({
    path: "test-results/preparation-matched.png",
    fullPage: true,
  })
  await page.getByRole("button", { name: "Review next match" }).click()
  await expect(page.getByRole("heading", { name: "Does this experience fit?" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "What did you do?" })).toBeHidden()
  await page.getByRole("button", { name: "Yes, use this experience" }).click()
  await expect(page.getByRole("heading", { name: "Match confirmed", exact: true })).toBeVisible()
  await expect(page.getByText("Nothing else to do for this match.")).toBeVisible()
  await expect(page.getByRole("textbox", { name: "What did you do?" })).toBeHidden()
  await page.screenshot({ path: "test-results/match-confirmed.png" })
  await page.getByRole("button", { name: "Done", exact: true }).click()
  await expect(page.locator(".target-row")).toHaveAttribute(
    "data-state",
    "confirmed",
  )
  await page.getByRole("button", { name: "Continue to documents" }).click()
  await page.getByRole("button", { name: "Create tailored resume" }).click()
  await expect(page.getByRole("region", { name: "Document creation" })).toContainText("Ready for review")
  await expect(page.getByLabel("Current draft preview")).toContainText("Built reliable event-driven services with Vue.")
  await page.screenshot({ path: "test-results/creation-draft.png", fullPage: true })
  await page.getByRole("button", { name: "Review proposal" }).click()
  await expect(
    page
      .getByRole("dialog")
      .getByRole("article")
      .getByText("Built reliable event-driven services with Vue.", {
        exact: true,
      }),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Save resume" })).toBeEnabled()
  await page.getByRole("dialog").evaluate((dialog) => { dialog.scrollTop = 0 })
  await page.screenshot({ path: "test-results/creation-review.png", fullPage: true })
  await page.getByRole("button", { name: "Save resume" }).click()
  await page.getByRole("button", { name: /Match your profile$/ }).click()
  await expect(page.locator(".target-state")).toHaveText(
    "Review document coverage",
  )
  await inspect(page)
  await page.getByRole("button", { name: "Document", exact: true }).click()
  await page.getByRole("checkbox", { name: "Vue", exact: true }).check()
  await page.getByRole("button", { name: "Confirm addressed" }).click()
  await page.keyboard.press("Escape")
  await expect(page.locator(".target-state")).toHaveText(
    "Addressed in document",
  )
  await page.reload()
  await expect(page.locator(".target-state")).toHaveText(
    "Addressed in document",
  )
})

test("draft edits survive reopening and clear affected proposed coverage", async ({ page, request }) => {
  await analyze(page)
  await page.getByRole("button", { name: /^Confirm requirement:/ }).click()
  await page.getByRole("button", { name: "Continue to matching" }).click()
  await page.getByRole("button", { name: "Match Career Profile", exact: true }).click()
  await page.getByRole("button", { name: "Review next match" }).click()
  await page.getByRole("button", { name: "Yes, use this experience" }).click()
  await page.getByRole("button", { name: "Done", exact: true }).click()
  await page.getByRole("button", { name: "Continue to documents" }).click()
  await page.getByRole("button", { name: "Create tailored resume" }).click()
  await page.getByRole("button", { name: "Review proposal" }).click()
  await page.getByRole("button", { name: "Edit draft", exact: true }).click()
  await page.getByRole("dialog").getByRole("article").getByText("Built reliable event-driven services with Vue.", { exact: true }).click()
  await page.getByRole("textbox", { name: "Edit text", exact: true }).fill("Built event-driven services with Vue.")
  await page.getByRole("button", { name: "Done editing" }).click()
  await page.getByRole("button", { name: "Keep draft edits" }).click()
  await expect(page.getByRole("dialog").getByText("0 proposed coverage bindings")).toBeVisible()
  const saved = await request.post("http://127.0.0.1:1439/command", { data: { command: "job_workspace_document", args: { artifact: "resume" } } })
  expect((await saved.json()).value).toBeNull()
  await page.reload()
  await expect(page.getByLabel("Current draft preview")).toContainText("Built event-driven services with Vue.")
  await page.getByRole("button", { name: "Review proposal" }).last().click()
  await expect(page.getByRole("button", { name: "Save resume" })).toBeEnabled()
  await page.getByRole("button", { name: "Save resume" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
})
test("narrow inspector is accessible and returns keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 })
  await analyze(page)
  const row = page.getByRole("button", {
    name: "Demonstrate reliable service development",
    exact: true,
  })
  await row.focus()
  await page.keyboard.press("Enter")
  await expect(
    page.getByRole("dialog", {
      name: "Demonstrate reliable service development",
    }),
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
  if (await page.getByRole("dialog").count())
    await page.keyboard.press("Escape")
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

test("requirement confirmation is invalidated by edits and the page has one scroll container", async ({
  page,
}) => {
  await analyze(page)
  await page.getByRole("button", { name: /^Confirm requirement:/ }).click()
  await expect(
    page.getByRole("button", { name: "Continue to matching" }),
  ).toBeEnabled()
  await page.evaluate(async () => {
    const path = "/src/lib/job-workspace.ts"
    const {
      readJobWorkspace,
      mutateJobWorkspace,
      workspaceTargets,
      emptyTarget,
    } = await import(path)
    let w = await readJobWorkspace(1)
    const original = workspaceTargets(w)[0]
    w = await mutateJobWorkspace(w, "target", {
      target: { ...original, title: "Updated requirement" },
    })
    for (let i = 0; i < 8; i++) {
      w = await mutateJobWorkspace(w, "target", {
        target: {
          ...emptyTarget(),
          title: `Additional requirement ${i + 1}`,
          interpretation: "Review this personal preparation requirement.",
        },
      })
    }
  })
  await page.reload()
  await expect(page.getByLabel("Current preparation step")).toContainText(
    "0 of 9 requirements confirmed",
  )
  await expect(
    page.getByRole("button", { name: "Continue to matching" }),
  ).toBeDisabled()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const scrollables = await page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .filter((el) => {
          const style = getComputedStyle(el)
          return (
            /auto|scroll/.test(style.overflowY) &&
            el.scrollHeight > el.clientHeight + 2 &&
            el.clientHeight > 0
          )
        })
        .map((el) => el.className),
    )
    expect(scrollables).toHaveLength(1)
    expect(scrollables[0]).toContain("job-preparation")
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
    await page.screenshot({
      path: `test-results/preparation-${width}.png`,
      fullPage: true,
    })
  }
})


test("rejecting a match shows a clear experience input", async ({ page }) => {
  await analyze(page)
  await page.getByRole("button", { name: /^Confirm requirement:/ }).click()
  await page.getByRole("button", { name: "Continue to matching" }).click()
  await inspect(page)
  await expect(page.getByRole("heading", { name: "Find matching experience" })).toBeVisible()
  await page.getByRole("button", { name: "Find a match", exact: true }).click()
  await page.getByRole("button", { name: "Review next match" }).click()
  await page.getByRole("button", { name: "Not a match", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Add experience for this requirement" })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "What did you do?" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Save and review match" })).toBeDisabled()
})


test("card approves evidence without opening a dialog", async ({ page }) => {
  await analyze(page)
  await page.getByRole("button", { name: /^Confirm requirement:/ }).click()
  await page.getByRole("button", { name: "Continue to matching" }).click()
  await page.getByRole("button", { name: "Match Career Profile", exact: true }).click()
  await page.getByRole("button", { name: "Approve evidence", exact: true }).click()
  await expect(page.locator(".target-row")).toHaveAttribute("data-state", "confirmed")
  await expect(page.getByRole("dialog")).toBeHidden()
  await page.reload()
  await expect(page.locator(".target-row")).toHaveAttribute("data-state", "confirmed")
  await page.getByRole("button", { name: "View evidence", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Match confirmed", exact: true })).toBeVisible()
})
