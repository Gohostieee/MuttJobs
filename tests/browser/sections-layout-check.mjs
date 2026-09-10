import { chromium } from '@playwright/test'
import { strict as assert } from 'node:assert'
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1223/chrome-win64/chrome.exe" })
try {
  const page = await browser.newPage(); await page.route("http://127.0.0.1:1420/", async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace(/<script type="module" src="\/src\/main.tsx[^<]*<\/script>/, "") }); })
  for (const width of [500, 320]) {
    await page.setViewportSize({width:700,height:1000})
    await page.goto('http://127.0.0.1:1420')
    await page.evaluate(async width => (await import('/tests/browser/sections-layout-fixture.tsx')).renderSections(width), width)
    const row = page.locator('.resume-section-link').first()
    await row.waitFor()
    assert.equal(await row.evaluate(el => getComputedStyle(el).display), 'grid', 'section labels need aligned grid columns')
    assert.ok((await row.boundingBox()).height > 40, 'section text needs two full lines')
    const expand = page.locator('.resume-section-expand:not(:disabled)').first()
    await expand.click()
    const item = page.locator('.resume-section-item-link').first()
    await item.waitFor()
    assert.equal(await item.evaluate(el => getComputedStyle(el).display), 'grid', 'entry labels need aligned grid columns')
    assert.ok((await item.boundingBox()).height > 35)
    await page.screenshot({path:`test-results/sections-layout-${width}.png`})
    console.log(`PASS ${width}: section and expanded entry layout`)
  }
} finally { await browser.close() }
