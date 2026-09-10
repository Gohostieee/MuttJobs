import assert from 'node:assert/strict'
import test from 'node:test'
import { buildResumeChatPrompt } from './resume-chat.ts'

test('follow-ups receive recent completed conversation and the current request', () => {
  const prompt = buildResumeChatPrompt([{role:'user',text:'Focus on leadership'}, {role:'assistant',text:'I revised the summary.'}], 'Make it shorter')
  assert.match(prompt, /Focus on leadership/)
  assert.match(prompt, /Current request:\nMake it shorter$/)
})
test('failed and incomplete answers are not replayed as context', () => {
  assert.equal(buildResumeChatPrompt([{role:'assistant', text:'Failed',error:'offline'},{role:'assistant',text:'Partial',streaming:true}], 'Retry'), 'Retry')
})
test('context stays within the desktop UTF-8 byte limit', () => {
  const prompt = buildResumeChatPrompt(Array.from({length:80},()=>({role:'user',text:'r�sum� '.repeat(30)})), '\u754c'.repeat(5000))
  assert.ok(new TextEncoder().encode(prompt).length < 20000)
  assert.throws(()=>buildResumeChatPrompt([], '\u754c'.repeat(6000)), /too long/)
})
