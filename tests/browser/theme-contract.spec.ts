import { test, expect } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("muttjobs.shadcn.active-theme", "custom-retired")
    localStorage.setItem("muttjobs.shadcn.mode", "light")
    const provider = { enabled: false, executableMode: "automatic", executablePath: null, healthIntervalSeconds: 0 }
    Object.assign(window, {
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      __TAURI_INTERNALS__: {
        invoke: async (command: string) => {
          if (command === "get_provider_settings") return { providers: { codex: provider, claudeCode: provider, theirStack: { enabled: false, apiKey: null, healthIntervalSeconds: 0 } } }
          if (command === "get_provider_health") return { providers: [] }
          if (command === "get_codex_skills" || command === "list_agent_skills") return { cwd: "Preview", skills: [], errors: [] }
          if (command.startsWith("plugin:event|")) return 1
          if (["list_saved_their_stack_jobs", "job_workspace_summaries", "list_job_import_jobs"].includes(command)) return []
          throw new Error("Browser preview: native service unavailable")
        },
        transformCallback: () => 1,
        unregisterCallback: () => {},
        convertFileSrc: (path: string) => path,
      },
    })
  })
})

test("every top-level workspace fits desktop and mobile", async ({ page }) => {
  const tabs = ["agent", "profile", "jobs", "applications", "resumes", "cover-letters", "settings"]
  const headings: Record<string, string> = {
    overview: "Overview", agent: "MuttJobs Agent", profile: "Your career profile", jobs: "Job Search",
    applications: "Applications", interviews: "Interviews", contacts: "Contacts",
    resumes: "Resumes", "cover-letters": "Cover Letters", settings: "Settings",
  }
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const tab of tabs) {
      await page.goto("/")
      await page.evaluate(tab => localStorage.setItem("muttjobs.active-tab", tab), tab)
      await page.reload()
      await expect(page.getByRole("heading", { name: headings[tab], exact: true }).first()).toBeVisible()
      await expect(page.locator("[data-slot=sidebar-inset]")).toBeVisible()
      if (width === 390) await expect(page.getByRole("button", { name: "Open sidebar", exact: true })).toHaveCount(1)
      await expect(page.locator("body")).toHaveCSS("background-color", "rgb(8, 8, 8)")
      await page.evaluate(() => document.fonts.ready)
      const bounds = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight }))
      expect(bounds.width, `${tab} at ${width}: page width`).toBeLessThanOrEqual(bounds.viewportWidth)
      expect(bounds.height, `${tab} at ${width}: outer page scroll`).toBeLessThanOrEqual(bounds.viewportHeight)
      await page.screenshot({ path: `test-results/theme-${tab}-${width}.png` })
    }
  }
  expect(errors).toEqual([])
})

test("application controls inherit theme tokens and retain native interactions", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Applications", exact: true }).click()
  const search = page.getByRole("textbox", { name: "Search applications" })
  await search.fill("engineer")
  await expect(search).toHaveValue("engineer")
  await page.getByLabel("Preparation filter").selectOption("Stale")
  await expect(page.getByLabel("Preparation filter")).toHaveValue("Stale")
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur()
    document.documentElement.style.setProperty("--primary", "rgb(40, 120, 160)")
    document.documentElement.style.setProperty("--primary-foreground", "rgb(250, 250, 250)")
    document.documentElement.style.setProperty("--input", "rgb(100, 120, 140)")
    document.documentElement.style.setProperty("--radius", "10px")
  })
  const action = page.getByRole("button", { name: "Import or paste job", exact: true }).first()
  await expect(action).toHaveCSS("background-color", "rgb(40, 120, 160)")
  await expect(action).toHaveCSS("color", "rgb(250, 250, 250)")
  await expect(search).toHaveCSS("border-color", "rgb(100, 120, 140)")
  await expect(search).toHaveCSS("border-radius", "10px")
})


test("country and token filters retain keyboard editing", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Job Search", exact: true }).click()
  await page.getByRole("button", { name: "Add filter", exact: true }).click()
  await page.getByRole("button", { name: "Job country", exact: true }).click()
  await page.getByRole("button", { name: /^Job country:/ }).click()
  await page.getByRole("combobox", { name: "Include countries", exact: true }).click()
  const countrySearch = page.getByPlaceholder("Type a country or ISO code")
  await countrySearch.fill("United States")
  await countrySearch.press("ArrowDown")
  await countrySearch.press("Enter")
  await expect(page.getByRole("button", { name: "Remove US", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Remove US", exact: true }).click()
  await expect(page.getByRole("button", { name: "Remove US", exact: true })).toHaveCount(0)
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Add filter", exact: true }).click()
  await page.getByRole("button", { name: "Job source domains", exact: true }).click()
  await page.getByRole("button", { name: /^Job source domains:/ }).click()
  const domains = page.getByRole("textbox").last()
  await domains.fill("example.com")
  await domains.press("Enter")
  await expect(page.getByRole("button", { name: "Remove example.com", exact: true })).toBeVisible()
  await domains.press("Backspace")
  await expect(page.getByRole("button", { name: "Remove example.com", exact: true })).toHaveCount(0)
})

test("document rendering stays independent of application colors", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  await page.goto("/")
  await page.getByRole("button", { name: "Resumes", exact: true }).click()
  await page.getByRole("button", { name: "Open joshua-rodriguez", exact: true }).click()
  const document = page.locator(".resume-viewport .resume-document").first()
  await expect(document).toBeVisible()
  const original = await document.evaluate(el => ({ width: getComputedStyle(el).width, color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }))
  expect(parseFloat(original.width)).toBeGreaterThan(700)
  await page.evaluate(() => {
    window.document.documentElement.style.setProperty("--background", "rgb(20, 30, 40)")
    window.document.documentElement.style.setProperty("--foreground", "rgb(210, 220, 230)")
  })
  await expect(document).toHaveCSS("background-color", original.background)
  await expect(document).toHaveCSS("color", original.color)
  await expect(document).toHaveCSS("width", original.width)
  await page.getByRole("button", { name: "Back to resume library", exact: true }).click()
  await page.getByRole("button", { name: "Cover Letters", exact: true }).click()
  await page.getByRole("button", { name: /^Open / }).filter({ hasText: "Open letter" }).first().click()
  await expect(page.locator(".resume-viewport .cover-letter-document").first()).toBeVisible()
  await page.getByRole("button", { name: "Page & margins", exact: true }).click()
  await page.getByLabel("Paper size", { exact: true }).selectOption("letter")
  await expect(page.getByLabel("Horizontal margin (mm)", { exact: true })).toBeVisible()
  expect(await page.locator(".resume-viewport .cover-letter-document").first().evaluate(el => parseFloat(getComputedStyle(el).width))).toBeCloseTo(816, 0)
  expect(errors).toEqual([])
})
