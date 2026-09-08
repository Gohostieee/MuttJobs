import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';
// Simulates streamed provider activity to check navigation and completion without a model call.
const executablePath = (process.env.LOCALAPPDATA || '') + '/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const browser = await chromium.launch({headless:true, ...(existsSync(executablePath) ? { executablePath } : {})});
try {
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[]; page.on('pageerror', e=>errors.push(e.message));
await page.goto('http://127.0.0.1:1420');
await page.evaluate(()=>{localStorage.setItem('muttjobs.active-tab','profile'); location.reload()});
await page.getByRole('button',{name:'Import resume',exact:true}).waitFor();
await page.evaluate(async()=>{
 const {runInBackground}=await import('/src/lib/background-activity.ts');
 window.finishImport = null;
 window.importDone=runInBackground('profile-import','Profile import',async report=>{
   report({type:'progress',stage:'Reading PDF pages'});
   report({type:'item',id:'read',kind:'reasoning',status:'running',eventType:'item.updated',item:{type:'reasoning',text:'Reading the resume and mapping its experience and skills.'}});
   await new Promise(resolve=>{window.finishImport=resolve});
   const {createDefaultProfile,saveProfile}=await import('/src/lib/profile-storage.ts');
   const p=createDefaultProfile(); p.basics.name='Background Import Fixture'; return saveProfile(p);
 });
});
await page.getByRole('region',{name:'Profile import progress'}).waitFor();
await page.evaluate(()=>window.dispatchEvent(new CustomEvent('muttjobs:navigate',{detail:'overview'})));
await page.getByRole('region',{name:'Profile import progress'}).waitFor({state:'detached'});
await page.evaluate(()=>window.dispatchEvent(new CustomEvent('muttjobs:navigate',{detail:'profile'})));
await page.getByText('Reading PDF pages',{exact:false}).waitFor();

await page.evaluate(async()=>{window.finishImport();await window.importDone});
await page.getByText('Profile import · Completed',{exact:true}).waitFor();
await page.evaluate(()=>window.dispatchEvent(new CustomEvent('muttjobs:navigate',{detail:'overview'})));
await page.evaluate(()=>window.dispatchEvent(new CustomEvent('muttjobs:navigate',{detail:'profile'})));
await page.getByText('Profile import · Completed',{exact:true}).waitFor();
console.log(JSON.stringify({navigationAndCompletion:'passed',errors}));
assert.deepEqual(errors, []);
} finally { await browser.close(); }

