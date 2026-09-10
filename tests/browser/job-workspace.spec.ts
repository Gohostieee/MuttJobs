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
  await page.getByRole("button", { name: /Preparation tasks$/ }).click()
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
  await page.getByRole("radio", { name: "Board", exact: true }).click()
  await expect(
    page.getByRole("region", { name: "Application board" }),
  ).toContainText("1 high-priority unresolved")
  await page.getByRole("radio", { name: "List", exact: true }).click()
  await page.screenshot({
    path: "test-results/applications-list.png",
    fullPage: true,
  })
})

test("requirement confirmation is invalidated by edits and the page has one scroll container", async ({
  page,
}) => {
  await analyze(page)
  await page.getByRole("button", { name: /^Confirm requirement:/ }).click()
  await expect(
    page.getByRole("button", { name: "View preparation tasks" }),
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
    page.getByRole("button", { name: "View preparation tasks" }),
  ).toBeEnabled()
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



test("preparation tasks persist without matching or document creation", async ({ page }) => {
  await analyze(page)
  await expect(page.getByRole("button", { name: /Match your profile|Documents$/ })).toHaveCount(0)
  await page.getByRole("button", { name: "View preparation tasks" }).click()
  const status = page.getByLabel("Status of Demonstrate reliable service development")
  await expect(status).toHaveValue("To do")
  await status.selectOption("Done")
  await expect(status).toBeEnabled()
  await page.reload()
  await expect(status).toHaveValue("Done")
  await page.screenshot({ path: "test-results/preparation-tasks.png", fullPage: true })
})

test("retired navigation restores to requirements", async ({ page }) => {
  await analyze(page)
  await page.evaluate(() => {
    localStorage.setItem("muttjobs.active-tab", "applications")
    localStorage.setItem("muttjobs.job-view.1", JSON.stringify({ destination: "Documents", step: "match" }))
  })
  await page.reload()
  await expect(page.getByRole("heading", { name: "What this role asks of you" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Resumes", exact: true })).toBeVisible()
})

async function openResumeTargets(page: Page) {
  await analyze(page)
  await page.getByRole("button", { name: "Resumes", exact: true }).click()
  await page.getByRole("button", { name: "Open fixture-resume", exact: true }).click()
  await page.getByRole("tab", { name: "Targets", exact: true }).click()
  await page.getByLabel("Job", { exact: true }).selectOption("1")
  await expect(page.getByRole("button", { name: "Check resume", exact: true })).toBeEnabled()
}

test("resume targets check the saved document and expire after an edit", async ({ page }) => {
  await openResumeTargets(page)
  await expect(page.getByRole("complementary", { name: "Matched target locations" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /^AI model:/ })).toBeVisible()
  await expect(page.getByRole("button", { name: /^Reasoning:/ })).toBeVisible()
  await page.getByRole("button", { name: /^AI model:/ }).click()
  await expect(page.getByRole("dialog", { name: "AI model selector" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("tab", { name: "Targets", exact: true })).toBeVisible()
  await page.getByRole("button", { name: /^Reasoning:/ }).click()
  await page.getByRole("menuitemradio", { name: "High", exact: true }).click()
  const submitted = page.waitForRequest(request => request.url().endsWith("/command") && request.postDataJSON()?.command === "resume_target_check_run")
  await page.getByRole("button", { name: "Check resume", exact: true }).click()
  expect((await submitted).postDataJSON().args.request.effort).toBe("high")
  await expect(page.getByRole("img", { name: "Matched", exact: true })).toBeVisible()
  await expect(page.getByText("1/1 matched", { exact: true })).toBeVisible()
  const locations = page.getByRole("complementary", { name: "Matched target locations" })
  await expect(locations).toBeVisible()
  const resizeHandle = page.getByRole("separator", { name: "Resize matched text panel" })
  const handleBounds = (await resizeHandle.boundingBox())!
  await page.mouse.move(handleBounds.x + handleBounds.width / 2, handleBounds.y + 100)
  await page.mouse.down()
  await page.mouse.move(handleBounds.x + handleBounds.width / 2 + 80, handleBounds.y + 100, { steps: 5 })
  await page.mouse.up()
  await expect(resizeHandle).toHaveAttribute("aria-valuenow", "336")
  expect(Math.round((await locations.boundingBox())!.width)).toBe(336)
  const expectZoomCentered = async () => {
    const pane = (await page.locator(".resume-viewport").boundingBox())!
    const zoom = (await page.getByRole("toolbar", { name: "Resume zoom controls" }).boundingBox())!
    expect(Math.abs((zoom.x + zoom.width / 2) - (pane.x + pane.width / 2))).toBeLessThan(2)
  }
  await expectZoomCentered()
  await resizeHandle.press("ArrowLeft")
  await expect(resizeHandle).toHaveAttribute("aria-valuenow", "320")
  await locations.getByRole("button").first().click()
  await expect(page.locator(".resume-viewport [data-target-highlight]")).toContainText("Built reliable event-driven services with Vue.")
  await page.screenshot({ path: "test-results/resume-targets-desktop.png", fullPage: true })
  await expect(locations.getByRole("button").first()).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator(".resume-viewport [data-target-highlight]")).toHaveCSS("outline-style", "solid")
  await page.getByRole("tab", { name: "Sections", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Sections", exact: true })).toBeVisible()
  await expect(locations).toHaveCount(0)
  await expectZoomCentered()
  await expect(page.locator("[data-target-highlight]")).toHaveCount(0)
  await page.getByRole("tab", { name: "Sections", exact: true }).press("ArrowRight")
  await expect(page.getByRole("tab", { name: "Targets", exact: true })).toHaveAttribute("aria-selected", "true")
  await expect(resizeHandle).toHaveAttribute("aria-valuenow", "320")
  await expect(page.getByText("1/1 matched", { exact: true })).toBeVisible()
  await page.locator(".resume-viewport").getByText("Built reliable event-driven services with Vue.", { exact: true }).click()
  await page.getByLabel("Edit text", { exact: true }).fill("Changed resume content")
  await page.getByRole("button", { name: "Done editing", exact: true }).click()
  await expect(page.getByRole("img", { name: "Matched", exact: true })).toHaveCount(0)
  await expect(locations).toHaveCount(0)
  await expect(page.getByText("Resume or targets changed. Check again to update the ticks.")).toBeVisible()
  await page.getByRole("button", { name: "Back to resume library", exact: true }).click()
  await page.getByRole("button", { name: "Open fixture-resume", exact: true }).click()
  await page.getByRole("tab", { name: "Targets", exact: true }).click()
  await expect(page.getByText("Resume or targets changed. Check again to update the ticks.")).toBeVisible()
})

test("target mode colors matched and unmatched bullets and removes colors outside targets", async ({ page }) => {
  await openResumeTargets(page)
  await page.locator(".resume-viewport").getByText("Built reliable event-driven services with Vue.", { exact: true }).click()
  const editor = page.getByLabel("Edit text", { exact: true })
  await editor.fill("Built reliable event-driven services with Vue.")
  await editor.press("Control+Home")
  await page.getByRole("button", { name: "Bulleted list", exact: true }).click()
  await editor.press("Control+End")
  await editor.press("Enter")
  await editor.pressSequentially("Organized team lunches.")
  await page.getByRole("button", { name: "Done editing", exact: true }).click()
  await expect(page.locator(".resume-viewport li")).toHaveCount(2)
  await expect(page.locator("[data-target-coverage]")).toHaveCount(0)
  await page.getByRole("button", { name: "Check resume", exact: true }).click()
  const green = page.locator('.resume-viewport li[data-target-coverage="matched"]')
  const red = page.locator('.resume-viewport li[data-target-coverage="unmatched"]')
  await expect(green).toHaveText("Built reliable event-driven services with Vue.")
  await expect(red).toHaveText("Organized team lunches.")
  await expect(green).toHaveCSS("background-color", "rgba(22, 163, 74, 0.16)")
  await expect(red).toHaveCSS("background-color", "rgba(220, 38, 38, 0.14)")
  await page.screenshot({ path: "test-results/target-bullet-colors.png", fullPage: true })
  await page.getByRole("tab", { name: "Sections", exact: true }).click()
  await expect(page.locator("[data-target-coverage]")).toHaveCount(0)
  await page.getByRole("tab", { name: "Targets", exact: true }).click()
  await expect(green).toHaveCount(1)
  await expect(red).toHaveCount(1)
  await green.click()
  await editor.fill("Changed experience")
  await expect(page.locator("[data-target-coverage]")).toHaveCount(0)
})

test("target checks continue across tabs and the sidebar fits a narrow viewport", async ({ page }) => {
  await openResumeTargets(page)
  let release!: () => void
  const pause = new Promise<void>(resolve => { release = resolve })
  await page.route("http://127.0.0.1:1439/command", async route => {
    if (route.request().postDataJSON().command === "resume_target_check_run") await pause
    await route.continue()
  })
  await page.getByRole("button", { name: "Check resume", exact: true }).click()
  await expect(page.getByRole("button", { name: /^Checking/ })).toBeDisabled()
  await page.getByRole("tab", { name: "Sections", exact: true }).click()
  release()
  await page.getByRole("tab", { name: "Targets", exact: true }).click()
  await expect(page.getByText("1/1 matched", { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole("button", { name: "Check resume", exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  const panelBounds = await page.locator(".resume-right-panel").boundingBox()
  expect(panelBounds!.x).toBeGreaterThanOrEqual(0)
  expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: "test-results/resume-targets-mobile.png", fullPage: true })
  await page.getByRole("button", { name: "Hide resume sidebar", exact: true }).click()
  await expect(page.getByRole("tab", { name: "Targets", exact: true })).toHaveCount(0)
})


test("job resume editor uses that job's targets directly", async ({ page }) => {
  await analyze(page)
  await page.getByRole("button", { name: "Resume editor", exact: true }).click()
  await page.getByRole("button", { name: "fixture-resume.json", exact: true }).click()
  await page.getByRole("tab", { name: "Targets", exact: true }).click()
  await expect(page.getByLabel("Job", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Check resume", exact: true }).click()
  await expect(page.getByText("1/1 matched", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Back to job", exact: true }).click()
  await expect(page.getByRole("heading", { name: "What this role asks of you" })).toBeVisible()
})
