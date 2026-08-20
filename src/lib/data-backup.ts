import { invoke } from "@tauri-apps/api/core"
import { relaunch } from "@tauri-apps/plugin-process"

export type BackupCategoryCounts = {
  resumes: number
  coverLetters: number
  jobs: number
  research: number
  skills: number
  preferences: number
  other: number
}

export type BackupExportSummary = {
  path: string
  exportedAt: string
  counts: BackupCategoryCounts
  totalFiles: number
  totalBytes: number
}

export type BackupConflictSummary = {
  conflicts: number
  newItems: number
  currentOnlyItems: number
}

export type BackupInspection = {
  appVersion: string
  exportedAt: string
  counts: BackupCategoryCounts
  totalFiles: number
  totalBytes: number
  conflictSummary: BackupConflictSummary
  redactions: string[]
  exclusions: string[]
}

type BackupImportTransaction = {
  transactionId: string
  preferences: Record<string, string>
  inspection: BackupInspection
}

export type BackupImportSummary = {
  importedAt: string
  counts: BackupCategoryCounts
  totalFiles: number
  totalBytes: number
}

export function collectMuttJobsPreferences(storage: Storage = window.localStorage) {
  const preferences: Record<string, string> = {}
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key?.startsWith("muttjobs.")) continue
    const value = storage.getItem(key)
    if (value !== null) preferences[key] = value
  }
  return preferences
}

export async function exportDataBackup(path: string): Promise<BackupExportSummary> {
  return invoke<BackupExportSummary>("export_data_backup", {
    path,
    preferences: collectMuttJobsPreferences(),
  })
}

export async function inspectDataBackup(path: string): Promise<BackupInspection> {
  return invoke<BackupInspection>("inspect_data_backup", { path })
}

export async function importDataBackup(path: string): Promise<BackupImportSummary> {
  const before = collectMuttJobsPreferences()
  let transaction: BackupImportTransaction | null = null
  try {
    transaction = await invoke<BackupImportTransaction>("begin_data_import", { path })
    for (const [key, value] of Object.entries(transaction.preferences)) {
      window.localStorage.setItem(key, value)
    }
    const summary = await invoke<BackupImportSummary>("commit_data_import", {
      transactionId: transaction.transactionId,
    })
    await relaunch()
    return summary
  } catch (cause) {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith("muttjobs.") && !(key in before)) window.localStorage.removeItem(key)
    }
    for (const [key, value] of Object.entries(before)) window.localStorage.setItem(key, value)
    if (transaction) {
      try {
        await invoke("rollback_data_import", { transactionId: transaction.transactionId })
      } catch {
        // Preserve the original failure; startup recovery handles interrupted transactions.
      }
    }
    throw cause
  }
}

export function formatBackupBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export function backupErrorMessage(cause: unknown, fallback: string) {
  if (typeof cause === "string" && cause.trim()) return cause
  if (cause instanceof Error && cause.message.trim()) return cause.message
  return fallback
}
