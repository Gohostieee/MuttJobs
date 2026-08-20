export type ThemeMode = "light" | "dark" | "system"

export type ThemeSource = "preset" | "imported"

export type ThemeTokenMap = Record<string, string>

export type ShadcnTheme = {
  id: string
  name: string
  description: string
  source: ThemeSource
  light: ThemeTokenMap
  dark: ThemeTokenMap
  rawCss: string
  createdAt?: string
}

const CUSTOM_THEMES_KEY = "muttjobs.shadcn.custom-themes"
const ACTIVE_THEME_KEY = "muttjobs.shadcn.active-theme"
const THEME_MODE_KEY = "muttjobs.shadcn.mode"
const ACTIVE_STYLE_ID = "muttjobs-active-shadcn-theme"
export const DEFAULT_THEME_ID = "yapyap"

type PaletteMode = {
  background: string
  foreground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  destructive: string
  border: string
  card?: string
  cardForeground?: string
  input?: string
  ring?: string
  radius?: string
  charts?: [string, string, string, string, string]
  sidebar?: string
  sidebarForeground?: string
  sidebarPrimary?: string
  sidebarPrimaryForeground?: string
  sidebarAccent?: string
  sidebarAccentForeground?: string
  sidebarBorder?: string
  sidebarRing?: string
}

function makeTokens(mode: PaletteMode): ThemeTokenMap {
  const card = mode.card ?? mode.background
  const cardForeground = mode.cardForeground ?? mode.foreground
  const input = mode.input ?? mode.border
  const ring = mode.ring ?? mode.primary
  const charts = mode.charts ?? [mode.primary, mode.accent, mode.secondary, mode.mutedForeground, mode.destructive]

  return {
    "--background": mode.background,
    "--foreground": mode.foreground,
    "--card": card,
    "--card-foreground": cardForeground,
    "--popover": card,
    "--popover-foreground": cardForeground,
    "--primary": mode.primary,
    "--primary-foreground": mode.primaryForeground,
    "--secondary": mode.secondary,
    "--secondary-foreground": mode.secondaryForeground,
    "--muted": mode.muted,
    "--muted-foreground": mode.mutedForeground,
    "--accent": mode.accent,
    "--accent-foreground": mode.accentForeground,
    "--destructive": mode.destructive,
    "--border": mode.border,
    "--input": input,
    "--ring": ring,
    "--chart-1": charts[0],
    "--chart-2": charts[1],
    "--chart-3": charts[2],
    "--chart-4": charts[3],
    "--chart-5": charts[4],
    "--radius": mode.radius ?? "0.625rem",
    "--sidebar": mode.sidebar ?? card,
    "--sidebar-foreground": mode.sidebarForeground ?? cardForeground,
    "--sidebar-primary": mode.sidebarPrimary ?? mode.primary,
    "--sidebar-primary-foreground": mode.sidebarPrimaryForeground ?? mode.primaryForeground,
    "--sidebar-accent": mode.sidebarAccent ?? mode.accent,
    "--sidebar-accent-foreground": mode.sidebarAccentForeground ?? mode.accentForeground,
    "--sidebar-border": mode.sidebarBorder ?? mode.border,
    "--sidebar-ring": mode.sidebarRing ?? ring,
  }
}

function serializeTokens(tokens: ThemeTokenMap, indent = "    ") {
  return Object.entries(tokens)
    .filter(([, value]) => isSafeTokenValue(value))
    .map(([name, value]) => `${indent}${name}: ${tokenToCssColor(value)};`)
    .join("\n")
}

function createThemeCss(light: ThemeTokenMap, dark: ThemeTokenMap) {
  const darkTokens = Object.keys(dark).length > 0 ? dark : light
  // Keep applied themes unlayered so they can override the app's static
  // unlayered :root and .dark token declarations. A layered rule always has
  // lower precedence than an unlayered rule, regardless of source order.
  return `:root {\n${serializeTokens(light, "  ")}\n}\n\n.dark {\n${serializeTokens(darkTokens, "  ")}\n}`
}

function createPreset(
  id: string,
  name: string,
  description: string,
  light: PaletteMode,
  dark: PaletteMode,
): ShadcnTheme {
  const lightTokens = makeTokens(light)
  const darkTokens = makeTokens(dark)

  return {
    id,
    name,
    description,
    source: "preset",
    light: lightTokens,
    dark: darkTokens,
    rawCss: createThemeCss(lightTokens, darkTokens),
  }
}

// newsite defines each theme as one palette rather than paired shadcn
// light/dark exports. Keep those source palettes in both slots so changing
// MuttJobs' mode does not silently replace the selected source design.
function createSinglePalettePreset(
  id: string,
  name: string,
  description: string,
  palette: PaletteMode,
) {
  return createPreset(id, name, description, palette, palette)
}

export const PRESET_THEMES: ShadcnTheme[] = [
  createPreset(
    "yapyap",
    "Yapyap",
    "NXResumeTwo's hard-edged neon lime, cyan, and magenta design language.",
    {
      background: "#f4f5fb",
      foreground: "#090d20",
      primary: "#86dd00",
      primaryForeground: "#050611",
      secondary: "#e6e9f7",
      secondaryForeground: "#101733",
      muted: "#eceef8",
      mutedForeground: "#55618c",
      accent: "#00b8cc",
      accentForeground: "#050611",
      destructive: "#d81b48",
      border: "#090d20",
      card: "#ffffff",
      cardForeground: "#090d20",
      input: "#eceef8",
      ring: "#2f5bff",
      radius: "0rem",
      charts: ["#2f5bff", "#00b8cc", "#8a4dff", "#ff2ea6", "#86dd00"],
      sidebar: "#ffffff",
      sidebarForeground: "#090d20",
      sidebarPrimary: "#2f5bff",
      sidebarPrimaryForeground: "#ffffff",
      sidebarAccent: "#eceef8",
      sidebarAccentForeground: "#101733",
      sidebarBorder: "#090d20",
      sidebarRing: "#2f5bff",
    },
    {
      background: "#090d20",
      foreground: "#f5f7ff",
      primary: "#9cff00",
      primaryForeground: "#050611",
      secondary: "#151f42",
      secondaryForeground: "#f5f7ff",
      muted: "#101733",
      mutedForeground: "#9aa8cf",
      accent: "#00e5ff",
      accentForeground: "#050611",
      destructive: "#ff4d6d",
      border: "#2c3863",
      card: "#101733",
      cardForeground: "#f5f7ff",
      input: "#1b2854",
      ring: "#00e5ff",
      radius: "0rem",
      charts: ["#00e5ff", "#9cff00", "#8a4dff", "#ff2ea6", "#2f5bff"],
      sidebar: "#050611",
      sidebarForeground: "#f5f7ff",
      sidebarPrimary: "#9cff00",
      sidebarPrimaryForeground: "#050611",
      sidebarAccent: "#151f42",
      sidebarAccentForeground: "#f5f7ff",
      sidebarBorder: "#2c3863",
      sidebarRing: "#00e5ff",
    },
  ),
  createSinglePalettePreset(
    "cathode-blue",
    "Cathode Blue",
    "newsite's cold CRT blue on deep space black.",
    {
      background: "#05080a",
      foreground: "#e1e2e7",
      primary: "#98cbff",
      primaryForeground: "#03131e",
      secondary: "#22303a",
      secondaryForeground: "#e1e2e7",
      muted: "#192026",
      mutedForeground: "#7f93a5",
      accent: "#0f1820",
      accentForeground: "#98cbff",
      destructive: "#ff7272",
      border: "rgba(152, 203, 255, 0.14)",
      card: "#151b20",
      cardForeground: "#e1e2e7",
      input: "rgba(152, 203, 255, 0.14)",
      ring: "rgba(152, 203, 255, 0.35)",
      radius: "0rem",
      charts: ["#98cbff", "#00a3ff", "#d6c94e", "#88ffd6", "#ff9a8c"],
      sidebar: "#111417",
      sidebarForeground: "#e1e2e7",
      sidebarPrimary: "#00a3ff",
      sidebarPrimaryForeground: "#03131e",
      sidebarAccent: "#22303a",
      sidebarAccentForeground: "#98cbff",
      sidebarBorder: "rgba(152, 203, 255, 0.14)",
      sidebarRing: "rgba(152, 203, 255, 0.35)",
    },
  ),
  createSinglePalettePreset(
    "amber-monitor",
    "Amber Monitor",
    "newsite's warm monochrome amber terminal glow.",
    {
      background: "#0c0703",
      foreground: "#f2ddc0",
      primary: "#ffb454",
      primaryForeground: "#1d1000",
      secondary: "#33230f",
      secondaryForeground: "#f2ddc0",
      muted: "#221708",
      mutedForeground: "#b39468",
      accent: "#1a1207",
      accentForeground: "#ffb454",
      destructive: "#ff6a5e",
      border: "rgba(255, 180, 84, 0.16)",
      card: "#1d1408",
      cardForeground: "#f2ddc0",
      input: "rgba(255, 180, 84, 0.16)",
      ring: "rgba(255, 180, 84, 0.38)",
      radius: "0rem",
      charts: ["#ffb454", "#ff9500", "#ff7847", "#ffd88c", "#e05a2b"],
      sidebar: "#171007",
      sidebarForeground: "#f2ddc0",
      sidebarPrimary: "#ff9500",
      sidebarPrimaryForeground: "#1d1000",
      sidebarAccent: "#33230f",
      sidebarAccentForeground: "#ffb454",
      sidebarBorder: "rgba(255, 180, 84, 0.16)",
      sidebarRing: "rgba(255, 180, 84, 0.38)",
    },
  ),
  createSinglePalettePreset(
    "phosphor-green",
    "Phosphor Green",
    "newsite's classic green phosphor tube.",
    {
      background: "#030905",
      foreground: "#d5f5df",
      primary: "#6cffa0",
      primaryForeground: "#01180a",
      secondary: "#163220",
      secondaryForeground: "#d5f5df",
      muted: "#0d1f14",
      mutedForeground: "#74a487",
      accent: "#071409",
      accentForeground: "#6cffa0",
      destructive: "#ff7a7a",
      border: "rgba(108, 255, 160, 0.15)",
      card: "#0b1c12",
      cardForeground: "#d5f5df",
      input: "rgba(108, 255, 160, 0.15)",
      ring: "rgba(108, 255, 160, 0.36)",
      radius: "0rem",
      charts: ["#6cffa0", "#00d966", "#c8ff5c", "#8cf0ff", "#f0ff8c"],
      sidebar: "#08150d",
      sidebarForeground: "#d5f5df",
      sidebarPrimary: "#00d966",
      sidebarPrimaryForeground: "#01180a",
      sidebarAccent: "#163220",
      sidebarAccentForeground: "#6cffa0",
      sidebarBorder: "rgba(108, 255, 160, 0.15)",
      sidebarRing: "rgba(108, 255, 160, 0.36)",
    },
  ),
  createSinglePalettePreset(
    "vapor-plum",
    "Vapor Plum",
    "newsite's magenta and cyan late-night synth palette.",
    {
      background: "#0a0512",
      foreground: "#ece2f7",
      primary: "#ff8ae2",
      primaryForeground: "#22042a",
      secondary: "#2f1b4b",
      secondaryForeground: "#ece2f7",
      muted: "#1e1130",
      mutedForeground: "#a189bd",
      accent: "#150c22",
      accentForeground: "#ff8ae2",
      destructive: "#ff6b8f",
      border: "rgba(255, 138, 226, 0.16)",
      card: "#1c0f2e",
      cardForeground: "#ece2f7",
      input: "rgba(255, 138, 226, 0.16)",
      ring: "rgba(255, 138, 226, 0.38)",
      radius: "0rem",
      charts: ["#ff8ae2", "#c04ff5", "#6ff2ff", "#6ff2ff", "#ffd76f"],
      sidebar: "#150b23",
      sidebarForeground: "#ece2f7",
      sidebarPrimary: "#c04ff5",
      sidebarPrimaryForeground: "#22042a",
      sidebarAccent: "#2f1b4b",
      sidebarAccentForeground: "#ff8ae2",
      sidebarBorder: "rgba(255, 138, 226, 0.16)",
      sidebarRing: "rgba(255, 138, 226, 0.38)",
    },
  ),
  createSinglePalettePreset(
    "paper-terminal",
    "Paper Terminal",
    "newsite's light workstation palette: ink on warm newsprint.",
    {
      background: "#e8e4d8",
      foreground: "#1b1a17",
      primary: "#1f4f8f",
      primaryForeground: "#f3f0e7",
      secondary: "#cdc7b5",
      secondaryForeground: "#1b1a17",
      muted: "#d5d0c0",
      mutedForeground: "#5e5a4e",
      accent: "#d9d4c4",
      accentForeground: "#1f4f8f",
      destructive: "#a32020",
      border: "rgba(27, 26, 23, 0.18)",
      card: "#e4e0d2",
      cardForeground: "#1b1a17",
      input: "rgba(27, 26, 23, 0.22)",
      ring: "rgba(31, 79, 143, 0.4)",
      radius: "0rem",
      charts: ["#1f4f8f", "#2f6fbf", "#b4401f", "#2f8f6f", "#8f6f2f"],
      sidebar: "#ded9cb",
      sidebarForeground: "#1b1a17",
      sidebarPrimary: "#2f6fbf",
      sidebarPrimaryForeground: "#f3f0e7",
      sidebarAccent: "#cdc7b5",
      sidebarAccentForeground: "#1f4f8f",
      sidebarBorder: "rgba(27, 26, 23, 0.18)",
      sidebarRing: "rgba(31, 79, 143, 0.4)",
    },
  ),
  createSinglePalettePreset(
    "big-env",
    "Big Env",
    "newsite's brutalist monochrome with a single red signal accent.",
    {
      background: "#080808",
      foreground: "#d8d4ca",
      primary: "#d8d4ca",
      primaryForeground: "#080808",
      secondary: "#262626",
      secondaryForeground: "#d8d4ca",
      muted: "#191919",
      mutedForeground: "#9b9891",
      accent: "#141414",
      accentForeground: "#d8d4ca",
      destructive: "#9e1b1b",
      border: "rgba(216, 212, 202, 0.16)",
      card: "#161616",
      cardForeground: "#d8d4ca",
      input: "rgba(216, 212, 202, 0.16)",
      ring: "rgba(241, 238, 229, 0.4)",
      radius: "0rem",
      charts: ["#d8d4ca", "#9b9891", "#9e1b1b", "#66635f", "#f1eee5"],
      sidebar: "#101010",
      sidebarForeground: "#d8d4ca",
      sidebarPrimary: "#f1eee5",
      sidebarPrimaryForeground: "#080808",
      sidebarAccent: "#262626",
      sidebarAccentForeground: "#d8d4ca",
      sidebarBorder: "rgba(216, 212, 202, 0.16)",
      sidebarRing: "rgba(241, 238, 229, 0.4)",
    },
  ),
  createSinglePalettePreset(
    "deepwater-station",
    "Deepwater Station",
    "newsite's sun-bleached sand and shallow-water teal palette.",
    {
      background: "#fdf4e3",
      foreground: "#23384a",
      primary: "#0d7f8c",
      primaryForeground: "#fffaf0",
      secondary: "#e6d3af",
      secondaryForeground: "#23384a",
      muted: "#eee0c6",
      mutedForeground: "#6b6350",
      accent: "#eadcbf",
      accentForeground: "#0d7f8c",
      destructive: "#c8452a",
      border: "rgba(35, 56, 74, 0.16)",
      card: "#f8eeda",
      cardForeground: "#23384a",
      input: "rgba(35, 56, 74, 0.2)",
      ring: "rgba(13, 127, 140, 0.42)",
      radius: "0rem",
      charts: ["#0d7f8c", "#14a3b3", "#f2734a", "#e8b53f", "#4a8f6b"],
      sidebar: "#f7ead2",
      sidebarForeground: "#23384a",
      sidebarPrimary: "#14a3b3",
      sidebarPrimaryForeground: "#fffaf0",
      sidebarAccent: "#e6d3af",
      sidebarAccentForeground: "#0d7f8c",
      sidebarBorder: "rgba(35, 56, 74, 0.16)",
      sidebarRing: "rgba(13, 127, 140, 0.42)",
    },
  ),
  createSinglePalettePreset(
    "bliss-blue",
    "Bliss Blue",
    "newsite's XP-inspired sky, grass, and blue desktop palette.",
    {
      background: "#d8edf9",
      foreground: "#173b5d",
      primary: "#245edb",
      primaryForeground: "#ffffff",
      secondary: "#bfe2f3",
      secondaryForeground: "#173b5d",
      muted: "#c4e5f4",
      mutedForeground: "#4e6f86",
      accent: "#fff0a8",
      accentForeground: "#5b4513",
      destructive: "#d84b3f",
      border: "rgba(23, 59, 93, 0.16)",
      card: "#e8f5fb",
      cardForeground: "#173b5d",
      input: "rgba(23, 59, 93, 0.2)",
      ring: "rgba(36, 94, 219, 0.42)",
      radius: "0rem",
      charts: ["#245edb", "#4aa22b", "#f0a33b", "#6bb8ee", "#c85b4d"],
      sidebar: "#c8e4f3",
      sidebarForeground: "#173b5d",
      sidebarPrimary: "#2f80ed",
      sidebarPrimaryForeground: "#ffffff",
      sidebarAccent: "#bfe2f3",
      sidebarAccentForeground: "#173b5d",
      sidebarBorder: "rgba(23, 59, 93, 0.16)",
      sidebarRing: "rgba(36, 94, 219, 0.42)",
    },
  ),
]

function isSafeTokenValue(value: string) {
  return value.trim().length > 0 && !/[{};]/.test(value)
}

function stripCssComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "")
}

function findClosingBrace(css: string, openingIndex: number) {
  let depth = 1
  let quote: string | null = null

  for (let index = openingIndex + 1; index < css.length; index += 1) {
    const character = css[index]
    if (quote) {
      if (character === quote && css[index - 1] !== "\\") quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === "{") depth += 1
    if (character === "}") {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function walkCssBlocks(css: string, visit: (header: string, body: string) => void) {
  let segmentStart = 0

  for (let index = 0; index < css.length; index += 1) {
    if (css[index] !== "{") {
      if (css[index] === ";") segmentStart = index + 1
      continue
    }

    const closingIndex = findClosingBrace(css, index)
    if (closingIndex === -1) return

    const header = css.slice(segmentStart, index).trim()
    const body = css.slice(index + 1, closingIndex)
    if (header) visit(header, body)
    walkCssBlocks(body, visit)
    index = closingIndex
    segmentStart = closingIndex + 1
  }
}

function parseDeclarations(body: string) {
  const tokens: ThemeTokenMap = {}
  let declarationStart = 0
  let parentheses = 0
  let quote: string | null = null

  const consume = (declaration: string) => {
    const separator = declaration.indexOf(":")
    if (separator === -1) return
    const name = declaration.slice(0, separator).trim()
    const value = declaration.slice(separator + 1).trim()
    if (/^--[a-zA-Z0-9_-]+$/.test(name) && isSafeTokenValue(value)) tokens[name] = value
  }

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]
    if (quote) {
      if (character === quote && body[index - 1] !== "\\") quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === "(") parentheses += 1
    if (character === ")") parentheses = Math.max(0, parentheses - 1)
    if (character === ";" && parentheses === 0) {
      consume(body.slice(declarationStart, index))
      declarationStart = index + 1
    }
  }
  consume(body.slice(declarationStart))

  return tokens
}

function isDarkSelector(selector: string) {
  return selector.includes("html.dark") || selector.includes(":root.dark") || /(^|[\s,(])\.dark\b/.test(selector)
}

function isLightSelector(selector: string) {
  return selector.includes(":root") || /(^|[\s,(])\.light\b/.test(selector)
}

export function parseThemeCss(css: string) {
  const light: ThemeTokenMap = {}
  const dark: ThemeTokenMap = {}
  const normalizedCss = stripCssComments(css).trim()

  if (!normalizedCss) throw new Error("Paste a shadcn CSS theme to import it.")

  walkCssBlocks(normalizedCss, (header, body) => {
    if (header.startsWith("@")) return
    const selector = header.replace(/\s+/g, " ")
    const tokens = parseDeclarations(body)
    if (isLightSelector(selector)) Object.assign(light, tokens)
    if (isDarkSelector(selector)) Object.assign(dark, tokens)
  })

  const allTokens = { ...light, ...dark }
  if (Object.keys(allTokens).length === 0) {
    throw new Error("No CSS variables were found inside a :root or .dark block.")
  }
  if (!allTokens["--background"] || !allTokens["--foreground"] || !allTokens["--primary"]) {
    throw new Error("This does not look like a complete shadcn theme. Include --background, --foreground, and --primary.")
  }

  return { light, dark }
}

export function createImportedTheme(name: string, css: string): ShadcnTheme {
  const trimmedName = name.trim()
  if (!trimmedName) throw new Error("Give the imported theme a name first.")
  if (trimmedName.length > 64) throw new Error("Theme names must be 64 characters or fewer.")

  const parsed = parseThemeCss(css)
  const id = `custom-${Date.now().toString(36)}`
  return {
    id,
    name: trimmedName,
    description: "Imported from local CSS.",
    source: "imported",
    light: parsed.light,
    dark: parsed.dark,
    rawCss: css.trim(),
    createdAt: new Date().toISOString(),
  }
}

function isTheme(value: unknown): value is ShadcnTheme {
  if (!value || typeof value !== "object") return false
  const theme = value as Partial<ShadcnTheme>
  return (
    typeof theme.id === "string" &&
    typeof theme.name === "string" &&
    typeof theme.description === "string" &&
    (theme.source === "preset" || theme.source === "imported") &&
    typeof theme.rawCss === "string" &&
    typeof theme.light === "object" &&
    theme.light !== null &&
    typeof theme.dark === "object" &&
    theme.dark !== null
  )
}

export function loadCustomThemes() {
  try {
    const stored = window.localStorage.getItem(CUSTOM_THEMES_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed.filter(isTheme) : []
  } catch {
    return []
  }
}

export function saveCustomThemes(themes: ShadcnTheme[]) {
  try {
    window.localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes))
  } catch {
    // Local storage can be unavailable in a restricted browser context.
  }
}

export function getStoredActiveThemeId() {
  try {
    return window.localStorage.getItem(ACTIVE_THEME_KEY)
  } catch {
    return null
  }
}

export function setStoredActiveThemeId(id: string) {
  try {
    window.localStorage.setItem(ACTIVE_THEME_KEY, id)
  } catch {
    // Local storage can be unavailable in a restricted browser context.
  }
}

export function getStoredThemeMode(): ThemeMode {
  try {
    const value = window.localStorage.getItem(THEME_MODE_KEY)
    return value === "dark" || value === "system" ? value : "light"
  } catch {
    return "light"
  }
}

export function setStoredThemeMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_MODE_KEY, mode)
  } catch {
    // Local storage can be unavailable in a restricted browser context.
  }
}

export function getThemeById(id: string | null, customThemes: ShadcnTheme[] = []) {
  return [...PRESET_THEMES, ...customThemes].find((theme) => theme.id === id) ?? null
}

function isSystemDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === "undefined") return
  const dark = mode === "dark" || (mode === "system" && isSystemDark())
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.style.colorScheme = dark ? "dark" : "light"
}

export function applyTheme(theme: ShadcnTheme | null, mode: ThemeMode) {
  if (typeof document === "undefined") return
  let style = document.getElementById(ACTIVE_STYLE_ID) as HTMLStyleElement | null

  if (!theme) {
    style?.remove()
    style = null
  } else {
    if (!style) {
      style = document.createElement("style")
      style.id = ACTIVE_STYLE_ID
      document.head.appendChild(style)
    }
    style.textContent = createThemeCss(theme.light, theme.dark)
    document.documentElement.dataset.muttjobsTheme = theme.id
  }

  applyThemeMode(mode)
}

export function initializeTheme() {
  const customThemes = loadCustomThemes()
  const activeTheme = getThemeById(getStoredActiveThemeId() ?? DEFAULT_THEME_ID, customThemes)
  applyTheme(activeTheme ?? PRESET_THEMES[0], getStoredThemeMode())
}

export function tokenToCssColor(value: string | undefined) {
  if (!value) return "transparent"
  const trimmed = value.trim()
  if (/^-?[\d.]+\s+-?[\d.]+%\s+-?[\d.]+%(?:\s+\/\s+.+)?$/.test(trimmed)) {
    return `hsl(${trimmed})`
  }
  return trimmed
}

export function themeSwatches(theme: ShadcnTheme) {
  return [
    tokenToCssColor(theme.light["--primary"]),
    tokenToCssColor(theme.light["--secondary"]),
    tokenToCssColor(theme.light["--accent"]),
  ]
}
