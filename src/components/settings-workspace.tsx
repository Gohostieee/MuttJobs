import { useEffect, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  RefreshCw,
  Settings2,
  Terminal,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  getProviderHealth,
  getProviderSettings,
  refreshProviderHealth,
  updateProviderSettings,
  type AgentProviderHealth,
  type CodexProviderSettings,
} from "@/lib/agent-providers"

const HEALTH_LABELS: Record<string, string> = {
  disabled: "Disabled",
  checking: "Checking",
  available: "Available",
  not_found: "Codex not found",
  authentication_required: "Authentication required",
  unsupported_version: "Unsupported version",
  worker_unavailable: "Worker unavailable",
  unhealthy: "Unhealthy",
}

export function SettingsWorkspace() {
  const [expanded, setExpanded] = useState(true)
  const [settings, setSettings] = useState<CodexProviderSettings | null>(null)
  const [health, setHealth] = useState<AgentProviderHealth | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([getProviderSettings(), getProviderHealth()])
      .then(([document, currentHealth]) => {
        if (!active) return
        setSettings(document.providers.codex)
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
      if (!disposed) setHealth(payload)
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

  const state = health?.state ?? "checking"

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
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Providers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Local agents available to MuttJobs features.
          </p>

          <div className="mt-6 overflow-hidden rounded-xl border bg-card">
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
                <CheckCircle2 className="size-4 text-emerald-500" />
              ) : (
                <CircleAlert className="size-4 text-amber-500" />
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
                      <select
                        id="codex-mode"
                        className="h-9 rounded-md border bg-background px-3 text-sm"
                        value={settings.executableMode}
                        onChange={(event) =>
                          void save({
                            ...settings,
                            executableMode: event.currentTarget.value as "automatic" | "custom",
                          })
                        }
                      >
                        <option value="automatic">Automatic</option>
                        <option value="custom">Custom path</option>
                      </select>
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
                        <span
                          className="max-w-[65%] truncate"
                          title={health?.executablePath}
                        >
                          {health?.executablePath ?? "Not resolved"}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Last checked</span>
                        <span>{health?.checkedAt ? new Date(health.checkedAt).toLocaleString() : "Never"}</span>
                      </div>
                    </div>

                    {health?.message ? (
                      <p className="text-sm text-muted-foreground">{health.message}</p>
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
          </div>
        </div>
      </div>
    </section>
  )
}
