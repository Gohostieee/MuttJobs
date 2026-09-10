import { chromium } from '@playwright/test'
import { strict as assert } from 'node:assert'
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1223/chrome-win64/chrome.exe' })
try {
  const page = await browser.newPage()
  await page.route('http://127.0.0.1:1420/', async route => {
    const response = await route.fetch()
    await route.fulfill({response, body: (await response.text()).replace(/<script type="module" src="\/src\/main.tsx[^<]*<\/script>/, '')})
  })
  await page.goto('http://127.0.0.1:1420')
  await page.evaluate(async () => (await import('/tests/browser/sections-layout-fixture.tsx')).renderLibrary())
  await page.getByRole('button', {name:/^Edit title for /}).click()
  await page.getByLabel('Resume title', {exact:true}).fill('Engineering resume')
  await page.getByRole('button', {name:'Save title',exact:true}).click()
  await page.getByRole('button', {name:'Duplicate Engineering resume',exact:true}).click()
  await page.getByRole('button', {name:'Open Engineering resume copy',exact:true}).waitFor()
  assert.equal(await page.getByRole('button', {name:/^Open (Engineering resume)/}).count(),2)
  await page.setViewportSize({width:390,height:900})
  await page.screenshot({path:'test-results/resume-picker-actions.png',fullPage:true})
  await page.getByRole('button', {name:'Open Engineering resume copy',exact:true}).click()
  await page.locator('.resume-viewer-title h1').waitFor()
  assert.equal(await page.locator('.resume-viewer-title h1').innerText(),'Engineering resume copy')
  assert.equal(await page.getByRole('button', {name:/^Duplicate/}).count(),0)
  assert.match(await page.locator('.resume-document').first().innerText(), /Joshua Rodriguez/)
  console.log('PASS: edit title, duplicate on picker, open copy, original name preserved, no viewer duplicate')
} finally { await browser.close() }
