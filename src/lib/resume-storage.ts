import { invoke } from "@tauri-apps/api/core"
import emptyResume from "../../public/empty-resume.json"
import sampleResume from "../../public/sample-resume.json"

import { createEmptyResume } from "@/lib/resume-defaults"
import { normalizeAndValidateResume } from "@/lib/resume-validation"
import type { ResumeData, ResumeFile } from "@/lib/resume-types"

export async function loadResumes(): Promise<ResumeFile[]> {
  try {
    const files = await invoke<unknown[]>("list_resumes")
    return files.flatMap((value) => {
      try {
        return [normalizeResumeFile(value)]
      } catch {
        return []
      }
    })
  } catch {
    return [
      {
        id: "sample-resume",
        fileName: "joshua-rodriguez.json",
        path: "Preview sample",
        updatedAt: 0,
        data: normalizeAndValidateResume(sampleResume),
      },
    ]
  }
}

export async function loadJobPrimaryResume(
  jobId: number,
  sourceFileName?: string | null,
): Promise<ResumeFile> {
  try {
    const value = await invoke<unknown>("load_job_primary_resume", { jobId })
    return normalizeResumeFile(value)
  } catch (reason) {
    // The browser preview has no Tauri command bridge. Mirror the selected
    // source resume there so the workflow can still exercise the editor.
    const fallback = (await loadResumes()).find((resume) => resume.fileName === sourceFileName)
    if (fallback && (fallback.path === "Preview sample" || fallback.path === "Local preview")) {
      return {
        ...fallback,
        id: "job-primary-resume-" + jobId,
        fileName: "primary-resume.json",
        path: "Local preview",
      }
    }
    throw reason
  }
}

export async function createResume(name: string): Promise<ResumeFile> {
  try {
    const value = await invoke<unknown>("create_resume", { name })
    return normalizeResumeFile(value)
  } catch {
    const timestamp = Date.now()
    const fileStem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled-resume"
    const data = createEmptyResume(name)
    return {
      id: `local-empty-resume-${timestamp}`,
      fileName: `${fileStem}-${timestamp}.json`,
      path: "Local preview",
      updatedAt: Math.floor(timestamp / 1000),
      data,
    }
  }
}

export async function createResumeFromPdf(pdfPath: string, name?: string): Promise<ResumeFile> {
  const value = await invoke<unknown>("create_resume_from_pdf", {
    pdfPath,
    name: name?.trim() || null,
  })
  const file = normalizeResumeFile(value)

  // Codex writes the imported document through the desktop boundary. Save the
  // normalized schema once more so the stored file matches what the renderer
  // and future loads see, including any defaults filled by the normalizer.
  return saveResume(file, file.data)
}

export async function saveResume(
  file: ResumeFile,
  data: ResumeData,
  options?: { jobId?: number },
): Promise<ResumeFile> {
  const normalized = ensureResumeData(data)
  try {
    const value = options?.jobId !== undefined
      ? await invoke<unknown>("save_job_primary_resume", {
          jobId: options.jobId,
          data: normalized,
        })
      : await invoke<unknown>("save_resume", {
          path: file.path,
          data: normalized,
        })
    return normalizeResumeFile(value)
  } catch (reason) {
    // The Vite preview has no Tauri command bridge. Keep the editing experience
    // usable there while real desktop builds still surface actual save errors.
    if (file.path === "Preview sample" || file.path === "Local preview") {
      return {
        ...file,
        data: normalized,
        updatedAt: Math.floor(Date.now() / 1000),
      }
    }
    throw reason
  }
}

export async function getResumesDirectory(): Promise<string | null> {
  try {
    return await invoke<string>("get_resumes_directory")
  } catch {
    return null
  }
}

function normalizeResumeFile(value: unknown): ResumeFile {
  const source = asRecord(value)
  const data = source.data === undefined ? emptyResume : source.data
  return {
    id: stringValue(source.id, `resume-${Date.now()}`),
    fileName: stringValue(source.fileName, "untitled-resume.json"),
    path: stringValue(source.path, ""),
    updatedAt: numberValue(source.updatedAt),
    data: normalizeAndValidateResume(data),
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

export function ensureResumeData(value: unknown): ResumeData {
  return normalizeAndValidateResume(value)
}
