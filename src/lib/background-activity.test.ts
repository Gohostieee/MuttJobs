import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { runInBackground, useBackgroundActivity } from './background-activity.ts'

test('background tasks retain updates without subscribers, reject duplicate runs, and retain results', async () => {
  let finish!: () => void
  const pending = runInBackground('test-run', 'Test', async (report) => {
    report({ type: 'progress', stage: 'Reading PDF' })
    await new Promise<void>((resolve) => { finish = resolve })
    report({ type: 'item', id: 'item-1', kind: 'reasoning', status: 'running', eventType: 'item.updated', item: { text: 'Reading' } })
    report({ type: 'item', id: 'item-1', kind: 'reasoning', status: 'completed', eventType: 'item.completed', item: { text: 'Read complete' } })
    return { saved: true }
  })
  assert.equal(useBackgroundActivity.getState().runs['test-run'].stage, 'Reading PDF')
  await assert.rejects(runInBackground('test-run', 'Duplicate', async () => null), /already running/)
  finish()
  await pending
  const task = useBackgroundActivity.getState().runs['test-run']
  assert.equal(task.status, 'completed')
  assert.equal(task.activities.length, 1)
  assert.equal(task.activities[0].status, 'completed')
  assert.deepEqual(task.result, { saved: true })
})

test('failure remains available and a retry starts with fresh activity', async () => {
  await assert.rejects(runInBackground('test-fail', 'Import', async () => { throw 'Provider unavailable' }))
  assert.equal(useBackgroundActivity.getState().runs['test-fail'].error, 'Provider unavailable')
  await runInBackground('test-fail', 'Import', async () => 'saved')
  assert.equal(useBackgroundActivity.getState().runs['test-fail'].error, null)
  assert.equal(useBackgroundActivity.getState().runs['test-fail'].result, 'saved')
})

test('structured desktop errors display their message', async () => {
  const error = { code: 'validation', message: 'Invalid evidence strength: strong' }
  await assert.rejects(runInBackground('structured-error', 'Job match', async () => { throw error }))
  assert.equal(useBackgroundActivity.getState().runs['structured-error'].error, error.message)
})
