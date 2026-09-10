import { chromium } from '@playwright/test'
import { strict as assert } from 'node:assert'
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1223/chrome-win64/chrome.exe" })
try {
  const page = await browser.newPage(); await page.route("http://127.0.0.1:1420/", async route => { const response = await route.fetch(); await route.fulfill({ response, body: (await response.text()).replace(/<script type="module" src="\/src\/main.tsx[^<]*<\/script>/, "") }); })
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 750 })
    await page.goto('http://127.0.0.1:1420')
    await page.evaluate(async () => (await import('/tests/browser/model-picker-fixture.tsx')).renderPicker())
    await page.locator('.resume-ai-model-trigger').click()
    const popup = page.getByRole('dialog', {name: 'AI model selector'})
    await popup.waitFor(); await page.waitForTimeout(200)
    await page.screenshot({path:`test-results/model-picker-${width}.png`})
    assert.equal(await popup.evaluate(el => getComputedStyle(el).display), 'grid', 'model rail must sit beside the model list')
    const name = page.locator('.resume-ai-model-item-name').first()
    assert.ok((await name.boundingBox()).height > 10, 'model names must not collapse')
    const bounds = await popup.boundingBox()
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'model popup fits viewport')
    await page.getByRole('textbox', {name:'Search models'}).fill('luna')
    await page.getByRole('option').first().click()
    await page.locator('.resume-ai-reasoning-trigger').click()
    const reasoning = page.getByRole('menu', {name:'Reasoning settings'})
    await reasoning.waitFor(); await page.waitForTimeout(200)
    assert.equal(await reasoning.evaluate(el => Math.round(el.getBoundingClientRect().width / parseFloat(getComputedStyle(document.documentElement).fontSize) * 100)),1125,'reasoning popup stays compact')
    await page.screenshot({path:`test-results/reasoning-picker-${width}.png`})
    await page.getByRole('menuitemradio', {name:'High',exact:true}).click()
    assert.match(await page.locator('.resume-ai-reasoning-trigger').innerText(), /High/)
    console.log(`PASS ${width}: layout, search, selection, reasoning`)
  }
} finally { await browser.close() }
