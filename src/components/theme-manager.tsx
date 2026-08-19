import { useEffect, useMemo, useState } from "react"
import {
  Check,
  Clipboard,
  Monitor,
  Moon,
  Palette,
  Sun,
  Trash2,
  Upload,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  applyTheme,
  applyThemeMode,
  createImportedTheme,
  DEFAULT_THEME_ID,
  getStoredActiveThemeId,
  getStoredThemeMode,
  getThemeById,
  loadCustomThemes,
  PRESET_THEMES,
  saveCustomThemes,
  setStoredActiveThemeId,
  setStoredThemeMode,
  themeSwatches,
  type ShadcnTheme,
  type ThemeMode,
} from "@/lib/theme-manager"
import { cn } from "@/lib/utils"

type ThemeView = "presets" | "import"

const THEME_MODES: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

export function ThemeManager() {
  const [customThemes, setCustomThemes] = useState<ShadcnTheme[]>(() => loadCustomThemes())
  const [activeThemeId, setActiveThemeId] = useState(
    () => getStoredActiveThemeId() ?? DEFAULT_THEME_ID,
  )
  const [mode, setMode] = useState<ThemeMode>(() => getStoredThemeMode())
  const [view, setView] = useState<ThemeView>("presets")
  const [themeName, setThemeName] = useState("")
  const [themeCss, setThemeCss] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const activeTheme = useMemo(
    () => getThemeById(activeThemeId, customThemes) ?? PRESET_THEMES[0],
    [activeThemeId, customThemes],
  )
  const themes = useMemo(() => [...PRESET_THEMES, ...customThemes], [customThemes])
  const themeToDelete = customThemes.find((theme) => theme.id === deleteId)

  useEffect(() => {
    applyTheme(activeTheme, mode)
    if (activeThemeId !== activeTheme.id) setActiveThemeId(activeTheme.id)
    setStoredActiveThemeId(activeTheme.id)
    setStoredThemeMode(mode)
  }, [activeTheme, activeThemeId, mode])

  useEffect(() => {
    if (mode !== "system") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => applyThemeMode(mode)
    media.addEventListener?.("change", handleChange)
    return () => media.removeEventListener?.("change", handleChange)
  }, [mode])

  function selectTheme(theme: ShadcnTheme) {
    setActiveThemeId(theme.id)
    setError(null)
  }

  function changeMode(nextMode: ThemeMode) {
    setMode(nextMode)
    setStoredThemeMode(nextMode)
  }

  function importTheme() {
    try {
      const imported = createImportedTheme(themeName, themeCss)
      const nextThemes = [imported, ...customThemes.filter((theme) => theme.name.toLowerCase() !== imported.name.toLowerCase())]
      setCustomThemes(nextThemes)
      saveCustomThemes(nextThemes)
      setActiveThemeId(imported.id)
      setStoredActiveThemeId(imported.id)
      setThemeName("")
      setThemeCss("")
      setError(null)
      setView("presets")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Theme could not be imported.")
    }
  }

  function removeTheme() {
    if (!themeToDelete) return
    const nextThemes = customThemes.filter((theme) => theme.id !== themeToDelete.id)
    setCustomThemes(nextThemes)
    saveCustomThemes(nextThemes)
    if (activeThemeId === themeToDelete.id) {
      setActiveThemeId(DEFAULT_THEME_ID)
      setStoredActiveThemeId(DEFAULT_THEME_ID)
    }
    setDeleteId(null)
  }

  function copyTheme(theme: ShadcnTheme) {
    void navigator.clipboard?.writeText(theme.rawCss)
  }

  return (
    <section className="mt-8" aria-labelledby="theme-manager-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Appearance
          </p>
          <h2 id="theme-manager-title" className="mt-1 text-lg font-semibold tracking-tight">
            Theme manager
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Switch the shadcn palette across the whole app, or keep a theme you found for later.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
          {THEME_MODES.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              variant={mode === value ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5 px-2.5"
              onClick={() => changeMode(value)}
              aria-pressed={mode === value}
            >
              <Icon />
              <span className="hidden sm:inline">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      <Card className="mt-5 gap-0 py-0">
        <CardHeader className="border-b py-4">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
              <Palette className="size-4" />
            </div>
            <div className="min-w-0">
              <CardTitle>Make it yours</CardTitle>
              <CardDescription className="mt-1">
                Presets are ready to use. Imported themes stay on this device.
              </CardDescription>
            </div>
            <Badge variant="outline" className="ml-auto hidden shrink-0 sm:inline-flex">
              {activeTheme.name}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5">
          <Tabs value={view} onValueChange={(value) => setView(value as ThemeView)}>
            <TabsList>
              <TabsTrigger value="presets">Presets</TabsTrigger>
              <TabsTrigger value="import">Import CSS</TabsTrigger>
            </TabsList>

            <TabsContent value="presets" className="mt-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {themes.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    active={activeTheme.id === theme.id}
                    onUse={() => selectTheme(theme)}
                    onCopy={() => copyTheme(theme)}
                    onDelete={theme.source === "imported" ? () => setDeleteId(theme.id) : undefined}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="import" className="mt-5">
              <form
                className="grid gap-5"
                onSubmit={(event) => {
                  event.preventDefault()
                  importTheme()
                }}
              >
                <div className="grid gap-2 sm:max-w-md">
                  <Label htmlFor="theme-name">Theme name</Label>
                  <Input
                    id="theme-name"
                    value={themeName}
                    maxLength={64}
                    placeholder="e.g. My midnight theme"
                    onChange={(event) => setThemeName(event.currentTarget.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-end justify-between gap-3">
                    <Label htmlFor="theme-css">shadcn CSS variables</Label>
                    <span className="text-xs text-muted-foreground">:root + .dark supported</span>
                  </div>
                  <Textarea
                    id="theme-css"
                    value={themeCss}
                    spellCheck={false}
                    className="min-h-64 resize-y font-mono text-xs leading-5"
                    placeholder={'@layer base {\n  :root {\n    --background: ...;\n    --primary: ...;\n  }\n\n  .dark {\n    --background: ...;\n  }\n}'}
                    onChange={(event) => setThemeCss(event.currentTarget.value)}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    Paste the complete export from shadcn/create or any compatible theme editor. The original CSS is
                    retained so you can copy it back out later; variables are read from the light and dark blocks.
                  </p>
                </div>
                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={!themeName.trim() || !themeCss.trim()}>
                    <Upload />
                    Save and use theme
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setThemeName("")
                      setThemeCss("")
                      setError(null)
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(themeToDelete)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {themeToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the locally saved theme. The original CSS will no longer be available in MuttJobs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeTheme}>Delete theme</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function ThemeCard({
  theme,
  active,
  onUse,
  onCopy,
  onDelete,
}: {
  theme: ShadcnTheme
  active: boolean
  onUse: () => void
  onCopy: () => void
  onDelete?: () => void
}) {
  const swatches = themeSwatches(theme)

  return (
    <Card
      role="button"
      tabIndex={0}
      className={cn(
        "cursor-pointer gap-3 py-4 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50",
        active && "border-primary/70 ring-2 ring-primary/20",
      )}
      onClick={onUse}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onUse()
        }
      }}
    >
      <CardHeader className="gap-3 px-4">
        <div className="flex items-start gap-3">
          <div className="flex -space-x-1.5 pt-0.5" aria-label={`${theme.name} color swatches`}>
            {swatches.map((color, index) => (
              <span
                key={`${theme.id}-${index}`}
                className="size-6 rounded-full border-2 border-card shadow-sm"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="truncate text-sm">{theme.name}</CardTitle>
              {theme.source === "imported" ? (
                <Badge variant="secondary" className="px-1.5 text-[10px]">
                  Saved
                </Badge>
              ) : null}
              {active ? <Check className="size-4 shrink-0 text-primary" aria-label="Active theme" /> : null}
            </div>
            <CardDescription className="mt-1 line-clamp-2 text-xs leading-5">
              {theme.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-2 px-4">
        <Button
          type="button"
          size="sm"
          variant={active ? "secondary" : "outline"}
          className="flex-1"
          onClick={(event) => {
            event.stopPropagation()
            onUse()
          }}
        >
          {active ? "Using theme" : "Use theme"}
        </Button>
        {theme.source === "imported" ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={(event) => {
                event.stopPropagation()
                onCopy()
              }}
              aria-label={`Copy ${theme.name} CSS`}
              title="Copy CSS"
            >
              <Clipboard />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={(event) => {
                event.stopPropagation()
                onDelete?.()
              }}
              aria-label={`Delete ${theme.name}`}
              title="Delete theme"
            >
              <Trash2 />
            </Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
