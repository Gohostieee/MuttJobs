import { load, type Store } from "@tauri-apps/plugin-store"

import { createEmptyResume } from "@/lib/resume-defaults"
import { normalizeAndValidateResume } from "@/lib/resume-validation"
import type { ResumeData } from "@/lib/resume-types"

const PROFILE_STORE_FILE = "profile.json"
const PROFILE_STORE_KEY = "profile-document"
const LOCAL_PROFILE_KEY = "muttjobs.profile.v1"

export type ProfileContext = {
  targetRole: string
  targetIndustries: string[]
  companySize: string
  companyStage: string
  workArrangement: string
  locationPreference: string
  compensation: string
  motivation: string
  strengths: string[]
  values: string[]
  preferredEnvironments: string[]
  managementStyle: string
  nonNegotiables: string[]
  dealBreakers: string[]
  additionalContext: string
}

export type ProfileDocument = ResumeData & {
  profile: ProfileContext
}

let profileStorePromise: Promise<Store> | null = null
let saveQueue: Promise<void> = Promise.resolve()

export function createDefaultProfile(): ProfileDocument {
  return {
    ...createEmptyResume(),
    profile: createDefaultProfileContext(),
  }
}

export async function loadProfile(): Promise<ProfileDocument> {
  try {
    const store = await getProfileStore()
    const stored = await store.get<unknown>(PROFILE_STORE_KEY)
    if (stored !== undefined) return normalizeProfile(stored)
  } catch {
    // Browser previews do not have the Tauri store bridge.
  }

  const local = readBrowserProfile()
  return local ? normalizeProfile(local) : createDefaultProfile()
}

export function saveProfile(value: ProfileDocument): Promise<ProfileDocument> {
  const normalized = normalizeProfile(value)
  const operation = saveQueue.then(async () => {
    try {
      const store = await getProfileStore()
      await store.set(PROFILE_STORE_KEY, normalized)
      await store.save()
    } catch (storeError) {
      try {
        writeBrowserProfile(normalized)
      } catch {
        throw storeError
      }
    }
  })

  saveQueue = operation.catch(() => undefined)
  return operation.then(() => normalized)
}

function createDefaultProfileContext(): ProfileContext {
  return {
    targetRole: "",
    targetIndustries: [],
    companySize: "",
    companyStage: "",
    workArrangement: "",
    locationPreference: "",
    compensation: "",
    motivation: "",
    strengths: [],
    values: [],
    preferredEnvironments: [],
    managementStyle: "",
    nonNegotiables: [],
    dealBreakers: [],
    additionalContext: "",
  }
}

async function getProfileStore(): Promise<Store> {
  if (!profileStorePromise) {
    profileStorePromise = load(PROFILE_STORE_FILE, { autoSave: false }).catch((error) => {
      profileStorePromise = null
      throw error
    })
  }
  return profileStorePromise
}

function normalizeProfile(value: unknown): ProfileDocument {
  const source = asRecord(value)
  const resumeSource = source.resume && typeof source.resume === "object" ? source.resume : source
  const resume = normalizeAndValidateResume(resumeSource)
  return {
    ...resume,
    profile: normalizeProfileContext(source.profile ?? source.context),
  }
}

function normalizeProfileContext(value: unknown): ProfileContext {
  const source = asRecord(value)
  return {
    targetRole: stringValue(source.targetRole),
    targetIndustries: stringList(source.targetIndustries),
    companySize: stringValue(source.companySize),
    companyStage: stringValue(source.companyStage),
    workArrangement: stringValue(source.workArrangement),
    locationPreference: stringValue(source.locationPreference),
    compensation: stringValue(source.compensation),
    motivation: stringValue(source.motivation),
    strengths: stringList(source.strengths),
    values: stringList(source.values),
    preferredEnvironments: stringList(source.preferredEnvironments),
    managementStyle: stringValue(source.managementStyle),
    nonNegotiables: stringList(source.nonNegotiables),
    dealBreakers: stringList(source.dealBreakers),
    additionalContext: stringValue(source.additionalContext),
  }
}

function readBrowserProfile(): unknown {
  try {
    if (typeof window === "undefined") return undefined
    const value = window.localStorage.getItem(LOCAL_PROFILE_KEY)
    return value ? JSON.parse(value) : undefined
  } catch {
    return undefined
  }
}

function writeBrowserProfile(profile: ProfileDocument) {
  if (typeof window === "undefined") throw new Error("Browser storage is unavailable.")
  window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile))
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string")
  if (typeof value === "string") return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)
  return []
}
