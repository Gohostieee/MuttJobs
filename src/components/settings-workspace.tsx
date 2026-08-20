import { useEffect, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog"
import {
  ArchiveRestore,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  RefreshCw,
  Settings2,
  Terminal,
  Upload,
  WalletCards,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ThemeManager } from "@/components/theme-manager"
import {
  backupErrorMessage,
  exportDataBackup,
  formatBackupBytes,
  importDataBackup,
  inspectDataBackup,
  type BackupExportSummary,
  type BackupInspection,
} from "@/lib/data-backup"
import {
  getProviderHealth,
  getProviderSettings,
  refreshProviderHealth,
  updateClaudeProviderSettings,
  updateProviderSettings,
  updateTheirStackProviderSettings,
  type AgentProviderHealth,
  type ClaudeCodeProviderSettings,
  type CodexProviderSettings,
  type ProviderHealthDocument,
  type TheirStackProviderSettings,
} from "@/lib/agent-providers"

const HEALTH_LABELS: Record<string, string> = {
  disabled: "Disabled",
  checking: "Checking",
  available: "Available",
  not_found: "CLI not found",
  authentication_required: "Authentication required",
  unsupported_version: "Unsupported version",
  worker_unavailable: "Worker unavailable",
  unhealthy: "Unhealthy",
}

export function SettingsWorkspace() {
  const [expanded, setExpanded] = useState(true)
  const [settings, setSettings] = useState<CodexProviderSettings | null>(null)
  const [claudeSettings, setClaudeSettings] = useState<ClaudeCodeProviderSettings | null>(null)
  const [theirStackSettings, setTheirStackSettings] = useState<TheirStackProviderSettings | null>(null)
  const [health, setHealth] = useState<ProviderHealthDocument | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([getProviderSettings(), getProviderHealth()])
      .then(([document, currentHealth]) => {
        if (!active) return
        setSettings(document.providers.codex)
        setClaudeSettings(document.providers.claudeCode)
        setTheirStackSettings(document.providers.theirStack)
        setHealth(currentHealth)
      })
      .catch((cause: unknown) => {
        if (active) setError(typeof cause === "string" ? cause : "Provider settings could not be loaded.")
      })
      .finally(() => {
        if (active) setBusy(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined

    void listen<AgentProviderHealth>("provider-health-changed", ({ payload }) => {
      if (!disposed) {
        setHealth((current) => upsertHealth(current, payload))
      }
    }).then((unlisten) => {
      if (disposed) unlisten()
      else cleanup = unlisten
    })

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [])

  async function save(next: CodexProviderSettings) {
    setSettings(next)
    setError(null)
    try {
      const document = await updateProviderSettings(next)
      setSettings(document.providers.codex)
    } catch (cause) {
      setError(typeof cause === "string" ? cause : "Provider settings could not be saved.")
    }
  }

  async function saveClaude(next: ClaudeCodeProviderSettings) {
    setClaudeSettings(next)
    setError(null)
    try {
      const document = await updateClaudeProviderSettings(next)
      setClaudeSettings(document.providers.claudeCode)
    } catch (cause) {
      setError(typeof cause === "string" ? cause : "Claude Code settings could not be saved.")
    }
  }

  async function saveTheirStack(next: TheirStackProviderSettings) {
    setTheirStackSettings(next)
    setError(null)
    try {
      const document = await updateTheirStackProviderSettings(next)
      setTheirStackSettings(document.providers.theirStack)
    } catch (cause) {
      setError(typeof cause === "string" ? cause : "TheirStack settings could not be saved.")
    }
  }

  async function refresh() {
    setBusy(true)
    setError(null)
    try {
      setHealth(await refreshProviderHealth())
    } catch (cause) {
      setError(typeof cause === "string" ? cause : "Provider health check failed.")
    } finally {
      setBusy(false)
    }
  }

  const codexHealth = health?.providers.find((provider) => provider.providerId === "codex")
  const claudeHealth = health?.providers.find((provider) => provider.providerId === "claude-code")
  const theirStackHealth = health?.providers.find((provider) => provider.providerId === "theirstack")
  const codexState = codexHealth?.state ?? "checking"
  const state = codexState

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <SidebarTrigger className="md:hidden" aria-label="Open sidebar" />
        <Settings2 className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Settings</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Application
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Customize the workspace and manage connections available to MuttJobs features.
          </p>

          <ThemeManager />

          <DataBackupCard />

          <div className="mt-10">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Connections
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Providers</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Local and external services available to MuttJobs features.
            </p>

          <Card className="mt-5 gap-0 py-0">
            <div className="flex items-center gap-3 p-4">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setExpanded((value) => !value)}
                aria-label={expanded ? "Collapse Codex settings" : "Expand Codex settings"}
              >
                {expanded ? <ChevronDown /> : <ChevronRight />}
              </Button>
              <div className="flex size-9 items-center justify-center rounded-lg border bg-background">
                <Terminal className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">Codex</div>
                <div className="truncate text-xs text-muted-foreground">
                  Local CLI through the packaged Codex SDK worker
                </div>
              </div>
              {busy || state === "checking" ? (
                <Spinner />
              ) : state === "available" ? (
                <CheckCircle2 className="size-4 text-status-success" />
              ) : (
                <CircleAlert className="size-4 text-status-warning" />
              )}
              <Badge variant="outline">{HEALTH_LABELS[state]}</Badge>
              {settings ? (
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={(enabled) => void save({ ...settings, enabled })}
                  aria-label="Enable Codex provider"
                />
              ) : null}
            </div>

            {expanded ? (
              <div className="grid gap-5 border-t p-5">
                {busy && !settings ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner /> Loading provider settings…
                  </div>
                ) : settings ? (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="codex-mode">Executable selection</Label>
                      <NativeSelect
                        id="codex-mode"
                        className="w-full"
                        value={settings.executableMode}
                        onChange={(event) =>
                          void save({
                            ...settings,
                            executableMode: event.currentTarget.value as "automatic" | "custom",
                          })
                        }
                      >
                        <NativeSelectOption value="automatic">Automatic</NativeSelectOption>
                        <NativeSelectOption value="custom">Custom path</NativeSelectOption>
                      </NativeSelect>
                    </div>

                    {settings.executableMode === "custom" ? (
                      <div className="grid gap-2">
                        <Label htmlFor="codex-path">Absolute executable path</Label>
                        <Input
                          id="codex-path"
                          value={settings.executablePath ?? ""}
                          placeholder="C:\\path\\to\\codex.exe"
                          onChange={(event) =>
                            setSettings({ ...settings, executablePath: event.currentTarget.value })
                          }
                          onBlur={() => void save(settings)}
                        />
                      </div>
                    ) : null}

                    <div className="grid gap-2">
                      <Label htmlFor="health-interval">Health-check interval (seconds)</Label>
                      <Input
                        id="health-interval"
                        type="number"
                        min={0}
                        value={settings.healthIntervalSeconds}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            healthIntervalSeconds: Math.max(0, Number(event.currentTarget.value) || 0),
                          })
                        }
                        onBlur={() => void save(settings)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Use 0 to disable background checks.
                      </p>
                    </div>

                    <div className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Resolved version</span>
                        <span>{codexHealth?.version ?? "—"}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Authentication</span>
                        <span>
                          {codexHealth?.authenticated === true
                            ? "Authenticated"
                            : codexHealth?.authenticated === false
                              ? "Not authenticated"
                              : "Unknown"}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Executable</span>
                        <span
                          className="max-w-[65%] truncate"
                          title={codexHealth?.executablePath}
                        >
                          {codexHealth?.executablePath ?? "Not resolved"}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Last checked</span>
                        <span>{codexHealth?.checkedAt ? new Date(codexHealth.checkedAt).toLocaleString() : "Never"}</span>
                      </div>
                    </div>

                    {codexHealth?.message ? (
                      <p className="text-sm text-muted-foreground">{codexHealth.message}</p>
                    ) : null}
                    {state === "authentication_required" ? (
                      <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                        <code className="flex-1">codex login</code>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void navigator.clipboard.writeText("codex login")}
                          aria-label="Copy login command"
                        >
                          <Copy />
                        </Button>
                      </div>
                    ) : null}
                    <div>
                      <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}>
                        <RefreshCw className={busy ? "animate-spin" : ""} />
                        Refresh health
                      </Button>
                    </div>
                  </>
                ) : null}
                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>

          <ClaudeCodeProviderCard
            settings={claudeSettings}
            health={claudeHealth}
            busy={busy}
            onSave={saveClaude}
            onRefresh={() => void refresh()}
          />
          <TheirStackProviderCard
            settings={theirStackSettings}
            health={theirStackHealth}
            busy={busy}
            onSave={saveTheirStack}
            onRefresh={() => void refresh()}
          />
          </div>
        </div>
      </div>
    </section>
  )
}

function DataBackupCard() {
  const [operation, setOperation] = useState<"export" | "inspect" | "import" | null>(null)
  const [inspection, setInspection] = useState<{ path: string; data: BackupInspection } | null>(null)
  const [exportSummary, setExportSummary] = useState<BackupExportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setError(null)
    setExportSummary(null)
    setOperation("export")
    try {
      const date = new Date().toISOString().slice(0, 10)
      const selected = await saveDialog({
        defaultPath: `MuttJobs-backup-${date}.muttjobs-backup`,
        filters: [{ name: "MuttJobs backup", extensions: ["muttjobs-backup"] }],
      })
      if (!selected) return
      const destination = selected.toLowerCase().endsWith(".muttjobs-backup")
        ? selected
        : `${selected}.muttjobs-backup`
      setExportSummary(await exportDataBackup(destination))
    } catch (cause) {
      setError(backupErrorMessage(cause, "MuttJobs could not export this backup."))
    } finally {
      setOperation(null)
    }
  }

  async function handleChooseImport() {
    setError(null)
    setOperation("inspect")
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "MuttJobs backup", extensions: ["muttjobs-backup"] }],
      })
      if (!selected || Array.isArray(selected)) return
      setInspection({ path: selected, data: await inspectDataBackup(selected) })
    } catch (cause) {
      setError(backupErrorMessage(cause, "MuttJobs could not inspect this backup."))
    } finally {
      setOperation(null)
    }
  }

  async function handleImport() {
    if (!inspection) return
    setOperation("import")
    setError(null)
    try {
      await importDataBackup(inspection.path)
    } catch (cause) {
      setError(backupErrorMessage(cause, "MuttJobs could not import this backup. Your previous data was restored."))
      setOperation(null)
      setInspection(null)
    }
  }

  const importing = operation === "import"
  const inspecting = operation === "inspect"
  const exporting = operation === "export"

  return (
    <div className="mt-10">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Data</p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">Backups</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Move your complete MuttJobs workspace between machines or keep a local recovery copy.
      </p>

      <Card className="mt-5 gap-0 py-0">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background">
            <ArchiveRestore className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">Export or import all durable data</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Includes jobs, application state, resumes, cover letters, profiles, research, saved searches,
              agent skills, settings, and themes. Temporary import files and provider credentials are excluded.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" onClick={() => void handleExport()} disabled={operation !== null}>
              {exporting ? <Spinner /> : <Download />}
              {exporting ? "Exporting…" : "Export backup"}
            </Button>
            <Button onClick={() => void handleChooseImport()} disabled={operation !== null}>
              {inspecting ? <Spinner /> : <Upload />}
              {inspecting ? "Inspecting…" : "Import backup"}
            </Button>
          </div>
        </div>
        <div className="border-t bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
          Backup files are not encrypted. Treat them as sensitive because they contain personal and job-search data.
        </div>
      </Card>

      {exportSummary ? (
        <Alert className="mt-3" role="status">
          <CheckCircle2 />
          <AlertTitle>Backup exported</AlertTitle>
          <AlertDescription>
            {exportSummary.totalFiles.toLocaleString()} files ({formatBackupBytes(exportSummary.totalBytes)}) saved to {exportSummary.path}.
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert className="mt-3" variant="destructive">
          <CircleAlert />
          <AlertTitle>Backup operation failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <AlertDialog open={inspection !== null} onOpenChange={(open) => { if (!open && !importing) setInspection(null) }}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Merge this MuttJobs backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Matching items will be replaced by the imported versions. Data found only on this machine will remain,
              provider credentials will be preserved, and MuttJobs will restart after the merge.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {inspection ? (
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <span className="text-muted-foreground">Exported</span>
              <span className="text-right">{new Date(inspection.data.exportedAt).toLocaleString()}</span>
              <span className="text-muted-foreground">Source version</span>
              <span className="text-right">{inspection.data.appVersion}</span>
              <span className="text-muted-foreground">Backup contents</span>
              <span className="text-right">{inspection.data.totalFiles.toLocaleString()} files · {formatBackupBytes(inspection.data.totalBytes)}</span>
              <span className="text-muted-foreground">Matching files</span>
              <span className="text-right">{inspection.data.conflictSummary.conflicts.toLocaleString()}</span>
              <span className="text-muted-foreground">New files</span>
              <span className="text-right">{inspection.data.conflictSummary.newItems.toLocaleString()}</span>
              <span className="text-muted-foreground">Current-only files kept</span>
              <span className="text-right">{inspection.data.conflictSummary.currentOnlyItems.toLocaleString()}</span>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void handleImport() }} disabled={importing}>
              {importing ? <Spinner /> : <ArchiveRestore />}
              {importing ? "Merging…" : "Merge and restart"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function TheirStackProviderCard({
  settings,
  health,
  busy,
  onSave,
  onRefresh,
}: {
  settings: TheirStackProviderSettings | null
  health: AgentProviderHealth | undefined
  busy: boolean
  onSave: (settings: TheirStackProviderSettings) => Promise<void>
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [apiKey, setApiKey] = useState(settings?.apiKey ?? "")
  const [healthInterval, setHealthInterval] = useState(settings?.healthIntervalSeconds ?? 300)
  const [savingKey, setSavingKey] = useState(false)
  const state = health?.state ?? "checking"

  useEffect(() => {
    setApiKey(settings?.apiKey ?? "")
    setHealthInterval(settings?.healthIntervalSeconds ?? 300)
  }, [settings?.apiKey, settings?.healthIntervalSeconds])

  async function saveKey() {
    if (!settings) return
    setSavingKey(true)
    try {
      await onSave({ ...settings, apiKey: apiKey.trim() || null })
    } finally {
      setSavingKey(false)
    }
  }

  return (
    <Card className="mt-4 gap-0 py-0">
      <div className="flex items-center gap-3 p-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "Collapse TheirStack settings" : "Expand TheirStack settings"}
        >
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </Button>
        <div className="flex size-9 items-center justify-center rounded-lg border bg-background">
          <WalletCards className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">TheirStack</div>
          <div className="truncate text-xs text-muted-foreground">
            Job data API using your own locally stored key
          </div>
        </div>
        {busy || state === "checking" ? (
          <Spinner />
        ) : state === "available" ? (
          <CheckCircle2 className="size-4 text-status-success" />
        ) : (
          <CircleAlert className="size-4 text-status-warning" />
        )}
        <Badge variant="outline">{HEALTH_LABELS[state]}</Badge>
        {settings ? (
          <Switch
            checked={settings.enabled}
            onCheckedChange={(enabled) => void onSave({ ...settings, enabled })}
            aria-label="Enable TheirStack provider"
          />
        ) : null}
      </div>

      {expanded ? (
        <div className="grid gap-5 border-t p-5">
          {busy && !settings ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading provider settings…
            </div>
          ) : settings ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="theirstack-api-key">API key</Label>
                <div className="flex gap-2">
                  <Input
                    id="theirstack-api-key"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    placeholder="Paste your TheirStack API key"
                    onChange={(event) => setApiKey(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void saveKey()
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={() => void saveKey()}
                    disabled={savingKey || apiKey.trim() === (settings.apiKey ?? "")}
                  >
                    {savingKey ? <Spinner /> : null}
                    Save key
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Stored only in this app&apos;s local provider settings and sent directly to TheirStack.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="theirstack-health-interval">Status refresh interval (seconds)</Label>
                <Input
                  id="theirstack-health-interval"
                  type="number"
                  min={0}
                  value={healthInterval}
                  onChange={(event) => setHealthInterval(Math.max(0, Number(event.currentTarget.value) || 0))}
                  onBlur={() => void onSave({ ...settings, healthIntervalSeconds: healthInterval })}
                />
                <p className="text-xs text-muted-foreground">Use 0 to disable background checks.</p>
              </div>

              <div className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Provider status</span>
                  <span>{HEALTH_LABELS[state]}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Authentication</span>
                  <span>
                    {health?.authenticated === true
                      ? "Authenticated"
                      : health?.authenticated === false
                        ? "Not authenticated"
                        : "Unknown"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">API credits remaining</span>
                  <span className="font-medium tabular-nums">
                    {health?.creditBalance ? health.creditBalance.apiCredits.toLocaleString() : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">API credits used</span>
                  <span className="tabular-nums">
                    {health?.creditBalance ? health.creditBalance.usedApiCredits.toLocaleString() : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Earliest expiration</span>
                  <span>
                    {health?.creditBalance?.earliestExpiration
                      ? new Date(health.creditBalance.earliestExpiration).toLocaleString()
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Last checked</span>
                  <span>{health?.checkedAt ? new Date(health.checkedAt).toLocaleString() : "Never"}</span>
                </div>
              </div>

              {health?.message ? <p className="text-sm text-muted-foreground">{health.message}</p> : null}
              <div>
                <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy}>
                  <RefreshCw className={busy ? "animate-spin" : ""} />
                  Refresh status and credits
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

function ClaudeCodeProviderCard({
  settings,
  health,
  busy,
  onSave,
  onRefresh,
}: {
  settings: ClaudeCodeProviderSettings | null
  health: AgentProviderHealth | undefined
  busy: boolean
  onSave: (settings: ClaudeCodeProviderSettings) => void
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [executablePath, setExecutablePath] = useState(settings?.executablePath ?? "")
  const [healthInterval, setHealthInterval] = useState(settings?.healthIntervalSeconds ?? 300)
  const state = health?.state ?? "checking"

  useEffect(() => {
    setExecutablePath(settings?.executablePath ?? "")
    setHealthInterval(settings?.healthIntervalSeconds ?? 300)
  }, [settings?.executablePath, settings?.healthIntervalSeconds])

  return (
    <Card className="mt-4 gap-0 py-0">
      <div className="flex items-center gap-3 p-4">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "Collapse Claude Code settings" : "Expand Claude Code settings"}
        >
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </Button>
        <div className="flex size-9 items-center justify-center rounded-lg border bg-background">
          <Terminal className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">Claude Code</div>
          <div className="truncate text-xs text-muted-foreground">
            Local Claude Code CLI through the packaged agent worker
          </div>
        </div>
        {busy || state === "checking" ? (
          <Spinner />
        ) : state === "available" ? (
          <CheckCircle2 className="size-4 text-status-success" />
        ) : (
          <CircleAlert className="size-4 text-status-warning" />
        )}
        <Badge variant="outline">{HEALTH_LABELS[state]}</Badge>
        {settings ? (
          <Switch
            checked={settings.enabled}
            onCheckedChange={(enabled) => onSave({ ...settings, enabled })}
            aria-label="Enable Claude Code provider"
          />
        ) : null}
      </div>

      {expanded ? (
        <div className="grid gap-5 border-t p-5">
          {busy && !settings ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Loading provider settings…
            </div>
          ) : settings ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="claude-mode">Executable selection</Label>
                <NativeSelect
                  id="claude-mode"
                  className="w-full"
                  value={settings.executableMode}
                  onChange={(event) =>
                    onSave({
                      ...settings,
                      executableMode: event.currentTarget.value as "automatic" | "custom",
                    })
                  }
                >
                  <NativeSelectOption value="automatic">Automatic</NativeSelectOption>
                  <NativeSelectOption value="custom">Custom path</NativeSelectOption>
                </NativeSelect>
              </div>

              {settings.executableMode === "custom" ? (
                <div className="grid gap-2">
                  <Label htmlFor="claude-path">Absolute executable path</Label>
                  <Input
                    id="claude-path"
                    value={executablePath}
                    placeholder="C:\\path\\to\\claude.exe"
                    onChange={(event) => setExecutablePath(event.currentTarget.value)}
                    onBlur={() => onSave({ ...settings, executablePath: executablePath })}
                  />
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="claude-health-interval">Health-check interval (seconds)</Label>
                <Input
                  id="claude-health-interval"
                  type="number"
                  min={0}
                  value={healthInterval}
                  onChange={(event) => setHealthInterval(Math.max(0, Number(event.currentTarget.value) || 0))}
                  onBlur={() => onSave({ ...settings, healthIntervalSeconds: healthInterval })}
                />
                <p className="text-xs text-muted-foreground">Use 0 to disable background checks.</p>
              </div>

              <div className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Resolved version</span>
                  <span>{health?.version ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Authentication</span>
                  <span>
                    {health?.authenticated === true
                      ? "Authenticated"
                      : health?.authenticated === false
                        ? "Not authenticated"
                        : "Unknown"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Executable</span>
                  <span className="max-w-[65%] truncate" title={health?.executablePath}>
                    {health?.executablePath ?? "Not resolved"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Last checked</span>
                  <span>{health?.checkedAt ? new Date(health.checkedAt).toLocaleString() : "Never"}</span>
                </div>
              </div>

              {health?.message ? <p className="text-sm text-muted-foreground">{health.message}</p> : null}
              {state === "authentication_required" ? (
                <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <code className="flex-1">claude auth login</code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void navigator.clipboard.writeText("claude auth login")}
                    aria-label="Copy Claude Code login command"
                  >
                    <Copy />
                  </Button>
                </div>
              ) : null}
              <div>
                <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy}>
                  <RefreshCw className={busy ? "animate-spin" : ""} />
                  Refresh health
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

function upsertHealth(document: ProviderHealthDocument | null, next: AgentProviderHealth): ProviderHealthDocument {
  const providers = document?.providers ? [...document.providers] : []
  const index = providers.findIndex((provider) => provider.providerId === next.providerId)
  if (index === -1) providers.push(next)
  else providers[index] = next
  return { providers }
}
