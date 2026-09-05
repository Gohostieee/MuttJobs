import assert from 'node:assert/strict'
import test from 'node:test'
import { PRESET_THEMES, parseThemeCss } from './theme-manager.ts'

function luminance(hex: string) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722
}
function ratio(a: string, b: string) {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05)
}
for (const theme of PRESET_THEMES) {
  test(`${theme.name} has distinct light and dark surfaces`, () => {
    assert.ok(luminance(theme.light['--background']) > .5)
    assert.ok(luminance(theme.dark['--background']) < .1)
  })
  for (const mode of ['light', 'dark'] as const) {
    test(`${theme.name} ${mode}: readable text and visible controls`, () => {
      const t = theme[mode]
      const check = (fg: string, bg: string, min = 4.5) => assert.ok(
        ratio(t[`--${fg}`], t[`--${bg}`]) >= min,
        `${fg} on ${bg}: ${ratio(t[`--${fg}`], t[`--${bg}`]).toFixed(2)} < ${min}`,
      )
      for (const role of ['card', 'popover', 'primary', 'secondary', 'accent', 'sidebar', 'sidebar-primary', 'sidebar-accent', 'destructive']) check(`${role}-foreground`, role)
      check('foreground', 'background')
      for (const surface of ['background', 'card', 'muted', 'secondary', 'sidebar']) {
        for (const role of ['muted-foreground', 'primary', 'destructive', 'status-success', 'status-warning']) check(role, surface)
        for (const role of ['input', 'ring', 'sidebar-ring', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5']) check(role, surface, 3)
      }
    })
  }
}
test('export preserves both palettes', () => {
  for (const theme of PRESET_THEMES) assert.deepEqual(parseThemeCss(theme.rawCss), { light: theme.light, dark: theme.dark })
})
test('imports require both modes and do not merge root.dark into light', () => {
  assert.throws(() => parseThemeCss(':root { --background: #ffffff; --foreground: #111111; --primary: #333333; }'), /separate/)
  const parsed = parseThemeCss(':root { --background: #ffffff; --foreground: #111111; --primary: #333333; } :root.dark { --background: #111111; --foreground: #ffffff; --primary: #eeeeee; }')
  assert.equal(parsed.light['--background'], '#ffffff')
  assert.equal(parsed.dark['--background'], '#111111')
})
