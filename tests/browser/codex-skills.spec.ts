import { test, expect } from "@playwright/test"

test("settings shows CLI skill states, search, paths, refresh errors and recovery", async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0
    let saves = 0
    let skillEnabled = true
    const settings = { enabled: true, executableMode: "automatic", executablePath: null, healthIntervalSeconds: 0 }
    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (command: string, args?: { path: string; enabled: boolean }) => {
        if (command === "get_provider_settings") return { providers: { codex: settings, claudeCode: settings, theirStack: { enabled: false, apiKey: null, healthIntervalSeconds: 0 } } }
        if (command === "get_provider_health") return { providers: [] }
        if (command === "get_codex_skills" || command === "set_codex_skill_enabled") {
          if (command === "set_codex_skill_enabled") {
            if (++saves === 2) throw "Save failed. Try again."
            skillEnabled = args!.enabled
          } else if (++calls === 2) throw "CLI unavailable. Try again."
          return { cwd: "C:/MuttJobs/resumes", skills: [
            { name: "resume-writing", description: "Write a clear resume", enabled: skillEnabled, scope: "repo", path: "C:/MuttJobs/resumes/.agents/skills/resume-writing/SKILL.md" },
            { name: "disabled-skill", description: "Disabled by configuration", enabled: false, scope: "user", path: "C:/skills/disabled/SKILL.md" },
          ], errors: [] }
        }
        if (command.startsWith("plugin:event|")) return 1
        if (command.startsWith("plugin:")) return null
        if (command === "list_agent_skills") return { skills: [], errors: [] }
        return []
      },
      transformCallback: () => 1, unregisterCallback: () => {}, convertFileSrc: (path: string) => path,
    }
  })
  await page.goto("/")
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  const card = page.getByLabel("Codex skills", { exact: true })
  await expect(card.getByText("1 enabled", { exact: true })).toBeVisible()
  await expect(card.getByText("1 disabled", { exact: true })).toBeVisible()
  await card.getByLabel("Search Codex skills").fill("resume-writing")
  await expect(card.getByText("disabled-skill", { exact: true })).toHaveCount(0)
  await card.getByText("resume-writing", { exact: true }).click()
  await expect(card.getByText("C:/MuttJobs/resumes/.agents/skills/resume-writing/SKILL.md", { exact: true })).toBeVisible()
  await card.getByLabel("Search Codex skills").fill("no-match")
  await expect(card.getByText("No skills match your search")).toBeVisible()
  await card.getByRole("button", { name: "Refresh skills" }).click()
  await expect(card.getByText("CLI unavailable. Try again.")).toBeVisible()
  await card.getByRole("button", { name: "Refresh skills" }).click()
  await card.getByLabel("Search Codex skills").fill("")
  await expect(card.getByText("resume-writing", { exact: true })).toBeVisible()
  const toggle = card.getByRole("switch", { name: "Enable resume-writing for MuttJobs" })
  await toggle.click()
  await expect(toggle).not.toBeChecked()
  await expect(card.getByText("0 enabled", { exact: true })).toBeVisible()
  await toggle.click()
  await expect(card.getByText("Save failed. Try again.")).toBeVisible()
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await expect(toggle).toBeChecked()
  await page.setViewportSize({ width: 390, height: 844 })
  await card.scrollIntoViewIfNeeded()
  await expect(card.getByRole("button", { name: "Refresh skills" })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: "test-results/codex-skills-mobile.png" })
})
