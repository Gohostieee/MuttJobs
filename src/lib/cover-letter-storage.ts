import { invoke } from "@tauri-apps/api/core"
import emptyCoverLetter from "../../public/empty-cover-letter.json"
import sampleCoverLetter from "../../public/sample-cover-letter.json"

import { createEmptyCoverLetter } from "@/lib/cover-letter-defaults"
import type { CoverLetterData, CoverLetterFile } from "@/lib/cover-letter-types"
import { normalizeAndValidateCoverLetter } from "@/lib/cover-letter-validation"
import type { TheirStackJob } from "@/lib/theirstack"

export async function loadCoverLetters(): Promise<CoverLetterFile[]> {
  try {
    const files = await invoke<unknown[]>("list_cover_letters")
    return files.flatMap((value) => {
      try { return [normalizeCoverLetterFile(value)] } catch { return [] }
    })
  } catch {
    return [{
      id: "sample-cover-letter",
      fileName: "jordan-lee-northstar.json",
      path: "Preview sample",
      updatedAt: 0,
      data: normalizeAndValidateCoverLetter(sampleCoverLetter),
    }]
  }
}

export async function createCoverLetter(name: string): Promise<CoverLetterFile> {
  try {
    return normalizeCoverLetterFile(await invoke<unknown>("create_cover_letter", { name }))
  } catch {
    const timestamp = Date.now()
    const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled-cover-letter"
    return {
      id: `local-empty-cover-letter-${timestamp}`,
      fileName: `${stem}-${timestamp}.json`,
      path: "Local preview",
      updatedAt: Math.floor(timestamp / 1000),
      data: createEmptyCoverLetter(name),
    }
  }
}

export async function loadOrCreateJobCoverLetter(job: TheirStackJob): Promise<CoverLetterFile> {
  try {
    return normalizeCoverLetterFile(await invoke<unknown>("load_or_create_job_cover_letter", { jobId: job.id }))
  } catch (reason) {
    // The browser preview has no Tauri command bridge. Keep the job workflow
    // usable there with the same job-aware document shape used on desktop.
    if (!("__TAURI_INTERNALS__" in window)) return createJobCoverLetterPreview(job)
    throw reason
  }
}

export async function hasDraftedJobCoverLetter(jobId: number): Promise<boolean> {
  try {
    return await invoke<boolean>("job_cover_letter_is_drafted", { jobId })
  } catch {
    return false
  }
}

export async function saveCoverLetter(
  file: CoverLetterFile,
  data: CoverLetterData,
  options?: { jobId?: number },
): Promise<CoverLetterFile> {
  const normalized = normalizeAndValidateCoverLetter(data)
  try {
    const value = options?.jobId === undefined
      ? await invoke<unknown>("save_cover_letter", { path: file.path, data: normalized })
      : await invoke<unknown>("save_job_cover_letter", { jobId: options.jobId, data: normalized })
    return normalizeCoverLetterFile(value)
  } catch (reason) {
    if (file.path === "Preview sample" || file.path === "Local preview") {
      return { ...file, data: normalized, updatedAt: Math.floor(Date.now() / 1000) }
    }
    throw reason
  }
}

function createJobCoverLetterPreview(job: TheirStackJob): CoverLetterFile {
  const data = createEmptyCoverLetter()
  data.recipient.company = job.company?.trim() || ""
  data.position.title = job.jobTitle
  return {
    id: `job-cover-letter-${job.id}`,
    fileName: "cover-letter.json",
    path: "Local preview",
    updatedAt: 0,
    data,
  }
}

export async function getCoverLettersDirectory(): Promise<string | null> {
  try { return await invoke<string>("get_cover_letters_directory") } catch { return null }
}

function normalizeCoverLetterFile(value: unknown): CoverLetterFile {
  const source = asRecord(value)
  return {
    id: stringValue(source.id, `cover-letter-${Date.now()}`),
    fileName: stringValue(source.fileName, "untitled-cover-letter.json"),
    path: stringValue(source.path, ""),
    updatedAt: numberValue(source.updatedAt),
    data: normalizeAndValidateCoverLetter(source.data === undefined ? emptyCoverLetter : source.data),
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value ? value : fallback
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}
