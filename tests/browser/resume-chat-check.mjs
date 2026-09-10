import { chromium, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
const server=process.env.RESUME_CHAT_TEST_URL ? null : await createServer({cacheDir:'.vite-resume-chat-check',optimizeDeps:{include:['@tauri-apps/api/mocks']},server:{host:'127.0.0.1',port:1448,watch:{usePolling:true,interval:1000}}});
if(server) await server.listen();
const localBrowser=join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1234/chrome-win64/chrome.exe');
const browser=await chromium.launch({headless:true,...(existsSync(localBrowser)?{executablePath:localBrowser}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
await page.goto(process.env.RESUME_CHAT_TEST_URL || 'http://127.0.0.1:1448', {waitUntil:'domcontentloaded',timeout:60000});
await page.evaluate(async()=>{
 const {mockIPC,emit,createElement,createRoot,ResumeViewer,normalizeAndValidateResume}=await import('/tests/browser/resume-chat-harness.tsx');
 let data=normalizeAndValidateResume(await (await fetch('/sample-resume.json')).json());
 window.chatCalls=[]; window.saved=[];window.failNext=false;
 const file=()=>({id:'chat-fixture',fileName:'chat.json',path:'Chat fixture',updatedAt:0,data});
 mockIPC(async(cmd,args)=>{
  if(cmd==='list_resumes') return [file()];
  if(cmd==='list_agent_skills') return {skills:[],errors:[]};
  if(cmd==='list_saved_theirstack_jobs') return [];
  if(cmd==='save_resume'){data=args.data;window.saved.push(data);return file();}
  if(cmd==='run_resume_ai_job'){
   window.chatCalls.push(args);
   if(window.failNext){window.failNext=false;throw new Error('Fixture provider disconnected');}
   await emit('resume-ai-event',{jobId:args.jobId,event:{type:'item',id:'tool-1',kind:'command_execution',status:'running',eventType:'item.started',item:{type:'command_execution',command:'Read resume'}}});
   await new Promise(r=>setTimeout(r,500));
   await emit('resume-ai-event',{jobId:args.jobId,event:{type:'item',id:'tool-1',kind:'command_execution',status:'completed',eventType:'item.completed',item:{type:'command_execution',command:'Read resume',aggregated_output:'Resume loaded'}}});
   data=structuredClone(data);data.summary.content='<p>Clear leadership summary '+window.chatCalls.length+'</p>';
   return {data,response:'Updated your **summary**.\n\n- Kept your experience intact.\n- Made the wording clearer.',changed:true};
  }
  return null;
 },{shouldMockEvents:true});
 document.getElementById('root').style.display='none';
 const host=document.createElement('div');host.style.height='100vh';document.body.append(host);
 createRoot(host).render(createElement(ResumeViewer,{file:file(),onBack:()=>{}}));
});
await expect(page.getByRole('tab',{name:'AI Chat',exact:true})).toBeVisible();
const input=page.getByRole('textbox',{name:/Ask .* to edit this resume/});
await expect(input).toBeVisible();
await page.getByRole('button',{name:'Choose AI model',exact:true}).click();
await page.getByRole('combobox').fill('GPT-5.6-Sol');
await page.getByRole('option',{name:/GPT-5.6-Sol/}).click();
await page.screenshot({path:'tmp/resume-chat-empty.png'});
await input.fill('Focus on leadership');await input.press('Enter');
await expect(page.getByText('Clear leadership summary 1',{exact:true}).first()).toBeVisible();
await expect(page.getByRole('button',{name:'Copy response',exact:true})).toBeVisible();
expect(await page.evaluate(()=>window.chatCalls[0].model)).toBe('gpt-5.6-sol');
await page.getByRole('tab',{name:'Sections',exact:true}).click();
await page.getByRole('tab',{name:'AI Chat',exact:true}).click();
await expect(page.getByText('Focus on leadership',{exact:true})).toBeVisible();
await page.getByRole('button',{name:'Hide resume sidebar',exact:true}).click();
await page.getByRole('button',{name:/Show resume sidebar|Show resume sections|Open resume sidebar/}).click();
await expect(page.getByText('Focus on leadership',{exact:true})).toBeVisible();
await input.fill('Make it shorter');await input.press('Enter');
await expect(page.getByText('Clear leadership summary 2',{exact:true}).first()).toBeVisible();
expect(await page.evaluate(()=>window.chatCalls[1].prompt)).toContain('Focus on leadership');
await page.screenshot({path:'tmp/resume-chat-complete.png'});
await page.getByRole('button',{name:'Undo last change',exact:true}).click();
await expect(page.getByText('Clear leadership summary 1',{exact:true}).first()).toBeVisible();
await page.getByRole('button',{name:'Redo last undone change',exact:true}).click();
await expect(page.getByText('Clear leadership summary 2',{exact:true}).first()).toBeVisible();
await page.evaluate(()=>{window.failNext=true});
await input.fill('Try again');await input.press('Enter');
await expect(page.getByRole('alert').filter({hasText:'Fixture provider disconnected'})).toBeVisible();
await page.getByRole('button',{name:'Retry request',exact:true}).click();
await expect(page.getByText('Clear leadership summary 4',{exact:true}).first()).toBeVisible();
await page.screenshot({path:'tmp/resume-chat-conversation.png'});
await page.setViewportSize({width:800,height:800});
await expect(input).toBeInViewport();
await page.screenshot({path:'tmp/resume-chat-narrow.png'});
await page.getByRole('button',{name:'New conversation',exact:true}).click();
await expect(page.getByText('Make your next move.',{exact:true})).toBeVisible();
expect(errors).toEqual([]);
console.log('PASS: chat tab, streamed tool, edit/save, follow-up context, tab/collapse retention, undo/redo, provider error/retry, new conversation, narrow viewport; no browser errors.');
} finally {await browser.close();await server?.close();}
