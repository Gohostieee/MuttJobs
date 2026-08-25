import { useCallback, useEffect, useRef, useState } from "react"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import {
  Briefcase,
  Check,
  CircleAlert,
  FileUp,
  FileText,
  Heart,
  Link2,
  LoaderCircle,
  Plus,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react"

import {
  DEFAULT_RESUME_AI_SELECTION,
  ModelReasoningSelector,
} from "@/components/resume-ai-sidebar"
import { SidebarTrigger } from "@/components/ui/sidebar"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type {
  AnyResumeItem,
  CustomField,
  CustomSection,
  Sections,
  SummaryItem,
} from "@/lib/resume-types"
import {
  createDefaultProfile,
  loadProfile,
  saveProfile,
  type ProfileContext,
  type ProfileDocument,
} from "@/lib/profile-storage"
import { importProfileFromResumePdf } from "@/lib/profile-import"

type ProfileUpdater = (update: (profile: ProfileDocument) => ProfileDocument) => void
type ProfileSectionKey = keyof Sections
type ProfileSection = {
  title: string
  icon: string
  columns: number
  alignment: "left" | "center" | "right"
  pageAlignment: "left" | "center" | "right"
  enabled: boolean
  hidden: boolean
  keepTogether: boolean
  startOnNewPage: boolean
  items: AnyResumeItem[]
}
type FieldValue = string | number | string[]
type FieldKind = "text" | "textarea" | "tags" | "number"

type ItemField = {
  key: string
  label: string
  kind: FieldKind
  placeholder?: string
  get: (item: AnyResumeItem) => FieldValue
  set: (item: AnyResumeItem, value: FieldValue) => AnyResumeItem
}

type SectionConfig = {
  key: ProfileSectionKey
  label: string
  description: string
  emptyDescription: string
  icon: LucideIcon
  fields: ItemField[]
}

const SECTION_CONFIGS: SectionConfig[] = [
  {
    key: "profiles",
    label: "Profiles",
    description: "Professional networks, portfolios, and public links.",
    emptyDescription: "Add LinkedIn, GitHub, a portfolio, or any other public profile.",
    icon: Link2,
    fields: [
      simpleField("network", "Network", "text", "LinkedIn"),
      simpleField("username", "Username", "text", "jordan-lee"),
      websiteField("Website", "https://example.com"),
    ],
  },
  {
    key: "experience",
    label: "Experience",
    description: "Every role, company, and accomplishment the AI can draw from.",
    emptyDescription: "Capture your work history, including roles that do not belong on one resume.",
    icon: Briefcase,
    fields: [
      simpleField("company", "Company", "text", "Company name"),
      simpleField("position", "Position", "text", "Role or title"),
      simpleField("location", "Location", "text", "City, state, or remote"),
      simpleField("period", "Period", "text", "2022 – Present"),
      websiteField("Company website", "https://company.com"),
      simpleField("description", "What you did", "textarea", "Scope, accomplishments, and useful detail..."),
    ],
  },
  {
    key: "education",
    label: "Education",
    description: "Degrees, coursework, and learning that inform your work.",
    emptyDescription: "Add degrees, bootcamps, certificates of study, or other formal learning.",
    icon: FileText,
    fields: [
      simpleField("school", "School", "text", "School or program"),
      simpleField("degree", "Degree", "text", "B.S., M.F.A., Certificate"),
      simpleField("area", "Area of study", "text", "Computer science"),
      simpleField("grade", "Grade", "text", "Optional"),
      simpleField("location", "Location", "text", "City, state"),
      simpleField("period", "Period", "text", "2018 – 2022"),
      websiteField("School website", "https://school.edu"),
      simpleField("description", "Notes", "textarea", "Relevant coursework, honors, or context..."),
    ],
  },
  {
    key: "projects",
    label: "Projects",
    description: "Side projects, launches, experiments, and shipped work.",
    emptyDescription: "Keep a complete project inventory here, even when only some projects fit a resume.",
    icon: Target,
    fields: [
      simpleField("name", "Project", "text", "Project name"),
      simpleField("period", "Period", "text", "2024"),
      websiteField("Project link", "https://github.com/..."),
      simpleField("description", "What it shows", "textarea", "Problem, approach, outcome, and your contribution..."),
    ],
  },
  {
    key: "skills",
    label: "Skills",
    description: "Capabilities, tools, and the language you use to describe them.",
    emptyDescription: "Group skills under overarching categories, then add the concrete terms as keywords.",
    icon: Sparkles,
    fields: [
      simpleField("name", "Skill category", "text", "Frontend, Leadership, Soft Skills"),
      simpleField("proficiency", "Proficiency", "text", "Advanced, working knowledge..."),
      simpleField("level", "Level (0–5)", "number", "0"),
      simpleField("keywords", "Skills / keywords", "tags", "React, roadmaps, prioritization"),
    ],
  },
  {
    key: "languages",
    label: "Languages",
    description: "Spoken and written languages, including working fluency.",
    emptyDescription: "Add the languages you use and how comfortable you are using them professionally.",
    icon: UserRound,
    fields: [
      simpleField("language", "Language", "text", "Spanish"),
      simpleField("fluency", "Fluency", "text", "Professional working proficiency"),
      simpleField("level", "Level (0–5)", "number", "0"),
    ],
  },
  {
    key: "interests",
    label: "Interests",
    description: "Topics and pursuits that add texture to your working profile.",
    emptyDescription: "Add interests that can help find authentic connections with a team or industry.",
    icon: Heart,
    fields: [
      simpleField("name", "Interest", "text", "Urban gardening"),
      simpleField("keywords", "Keywords", "tags", "community, sustainability"),
    ],
  },
  {
    key: "awards",
    label: "Awards",
    description: "Recognition, wins, and proof points worth remembering.",
    emptyDescription: "Keep awards here as a source of evidence, even when they are not resume-ready yet.",
    icon: Sparkles,
    fields: [
      simpleField("title", "Award", "text", "Award name"),
      simpleField("awarder", "Awarded by", "text", "Organization"),
      simpleField("date", "Date", "text", "2024"),
      websiteField("Award link", "https://example.com"),
      simpleField("description", "Context", "textarea", "Why it mattered and what it demonstrates..."),
    ],
  },
  {
    key: "certifications",
    label: "Certifications",
    description: "Credentials, courses, and professional qualifications.",
    emptyDescription: "Add completed or active certifications that may matter for future roles.",
    icon: FileText,
    fields: [
      simpleField("title", "Certification", "text", "Certification name"),
      simpleField("issuer", "Issuer", "text", "Organization"),
      simpleField("date", "Date", "text", "2024"),
      websiteField("Credential link", "https://example.com"),
      simpleField("description", "Notes", "textarea", "What the credential covers..."),
    ],
  },
  {
    key: "publications",
    label: "Publications",
    description: "Writing, talks, research, and public points of view.",
    emptyDescription: "Store articles, talks, podcasts, and other published work in one place.",
    icon: FileText,
    fields: [
      simpleField("title", "Title", "text", "Article or talk title"),
      simpleField("publisher", "Publisher", "text", "Publication or event"),
      simpleField("date", "Date", "text", "2024"),
      websiteField("Publication link", "https://example.com"),
      simpleField("description", "Summary", "textarea", "What it covers and why it matters..."),
    ],
  },
  {
    key: "volunteer",
    label: "Volunteer work",
    description: "Community work and service that reflects how you contribute.",
    emptyDescription: "Include volunteer work, board roles, and community contributions.",
    icon: Heart,
    fields: [
      simpleField("organization", "Organization", "text", "Organization name"),
      simpleField("location", "Location", "text", "City, state, or remote"),
      simpleField("period", "Period", "text", "2021 – Present"),
      websiteField("Organization website", "https://example.org"),
      simpleField("description", "Contribution", "textarea", "What you contributed and the impact..."),
    ],
  },
  {
    key: "references",
    label: "References",
    description: "People who can speak to your work, kept private to this profile.",
    emptyDescription: "Keep reference context here for later use; it will not be added to resumes automatically.",
    icon: UserRound,
    fields: [
      simpleField("name", "Name", "text", "Reference name"),
      simpleField("position", "Position", "text", "Role or relationship"),
      simpleField("phone", "Phone", "text", "Optional"),
      websiteField("Profile or website", "https://linkedin.com/in/..."),
      simpleField("description", "Context", "textarea", "How you worked together and what they can speak to..."),
    ],
  },
]

export function ProfileWorkspace() {
  const [profile, setProfile] = useState<ProfileDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved")
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importPdfPath, setImportPdfPath] = useState("")
  const [importSelection, setImportSelection] = useState(DEFAULT_RESUME_AI_SELECTION)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState("")
  const [importNotice, setImportNotice] = useState("")
  const profileRef = useRef<ProfileDocument | null>(null)
  const saveVersion = useRef(0)

  useEffect(() => {
    let active = true
    void loadProfile()
      .then((document) => {
        if (!active) return
        profileRef.current = document
        setProfile(document)
      })
      .catch((cause: unknown) => {
        if (!active) return
        const fallback = createDefaultProfile()
        profileRef.current = fallback
        setProfile(fallback)
        setLoadError(cause instanceof Error ? cause.message : "The profile could not be loaded.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const updateProfile = useCallback<ProfileUpdater>((update) => {
    const current = profileRef.current
    if (!current) return

    const next = update(current)
    profileRef.current = next
    setProfile(next)
    setSaveState("saving")
    const version = ++saveVersion.current

    void saveProfile(next)
      .then((saved) => {
        if (version !== saveVersion.current) return
        profileRef.current = saved
        setProfile(saved)
        setSaveState("saved")
      })
      .catch(() => {
        if (version === saveVersion.current) setSaveState("error")
      })
  }, [])

  function openImportDialog() {
    setImportPdfPath("")
    setImportError("")
    setImportDialogOpen(true)
  }

  async function chooseResumePdf() {
    setImportError("")
    try {
      const selectedPath = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "PDF resume", extensions: ["pdf"] }],
      })
      if (typeof selectedPath === "string") setImportPdfPath(selectedPath)
    } catch (reason) {
      setImportError(reason instanceof Error ? reason.message : "Could not choose a PDF resume.")
    }
  }

  async function importResumeIntoProfile() {
    const current = profileRef.current
    if (!current || !importPdfPath || importing) return

    let savingImportedProfile = false
    setImporting(true)
    setImportError("")
    setImportNotice("")
    try {
      const result = await importProfileFromResumePdf(importPdfPath, current, importSelection)
      const version = ++saveVersion.current
      savingImportedProfile = true
      setSaveState("saving")
      const saved = await saveProfile(result.profile)
      if (version === saveVersion.current) {
        profileRef.current = saved
        setProfile(saved)
        setSaveState("saved")
      }
      setImportNotice(`Imported ${getFileName(importPdfPath)} into your Profile.`)
      setImportDialogOpen(false)
      setImportPdfPath("")
    } catch (reason) {
      setImportError(reason instanceof Error ? reason.message : "The resume could not be imported into your Profile.")
      if (savingImportedProfile) setSaveState("error")
    } finally {
      setImporting(false)
    }
  }

  if (loading || !profile) return <ProfileLoading />

  const itemCount = SECTION_CONFIGS.reduce((count, config) => {
    const section = profile.sections[config.key] as ProfileSection
    return count + section.items.length
  }, 0)

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <SidebarTrigger className="md:hidden" aria-label="Open sidebar" />
        <UserRound className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Profile</span>
        <div className="ml-auto flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={openImportDialog}>
            <FileUp /> Import resume
          </Button>
          <SaveStatus state={saveState} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <Card className="border-primary/20 bg-primary/[0.025]">
            <CardContent className="flex flex-col gap-5 p-5 md:flex-row md:items-end md:justify-between md:p-6">
              <div className="max-w-2xl">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="outline" className="gap-1.5 bg-background/60">
                    <Sparkles className="size-3" /> Source of truth
                  </Badge>
                  <span className="text-xs text-muted-foreground">Private to this workspace</span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {profile.basics.name || "Your career profile"}
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Keep the full version of your story here. Resume AI can use this context later to choose the right evidence for each role.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs md:min-w-56">
                <ProfileMetric label="Structured items" value={itemCount} />
                <ProfileMetric label="Target industries" value={profile.profile.targetIndustries.length} />
              </div>
            </CardContent>
          </Card>

          {loadError ? (
            <div className="flex items-center gap-2 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-muted-foreground">
              <CircleAlert className="size-4 text-status-warning" />
              <span>{loadError} Editing a new profile for now.</span>
            </div>
          ) : null}

          {importNotice ? (
            <div className="flex items-center gap-2 rounded-lg border border-status-success/40 bg-status-success/10 px-3 py-2 text-sm text-muted-foreground" role="status">
              <Check className="size-4 text-status-success" />
              <span>{importNotice} Profile-only preferences and presentation settings were preserved.</span>
            </div>
          ) : null}

          <BasicsEditor profile={profile} onUpdate={updateProfile} />
          <ContextEditor profile={profile} onUpdate={updateProfile} />
          <SummaryEditor profile={profile} onUpdate={updateProfile} />

          <div className="grid gap-6 xl:grid-cols-2">
            {SECTION_CONFIGS.map((config) => (
              <StandardSectionEditor
                key={config.key}
                profile={profile}
                config={config}
                onUpdate={updateProfile}
              />
            ))}
          </div>

          <CustomSectionsEditor profile={profile} onUpdate={updateProfile} />
          <MetadataEditor profile={profile} onUpdate={updateProfile} />
        </div>
      </div>

      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          if (!importing) setImportDialogOpen(open)
        }}
      >
        <DialogContent className="resume-create-dialog">
          <form
            className="grid min-w-0 gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void importResumeIntoProfile()
            }}
          >
            <DialogHeader>
              <DialogTitle>Import a resume into Profile</DialogTitle>
              <DialogDescription>
                The agent will losslessly replace resume-backed Profile fields with facts from the PDF. Company-fit, culture, compensation, and presentation preferences stay intact.
              </DialogDescription>
            </DialogHeader>

            <div className="resume-import-selector grid min-w-0 gap-2">
              <Label>Model and reasoning</Label>
              <ModelReasoningSelector
                value={importSelection}
                onChange={setImportSelection}
                disabled={importing}
              />
            </div>

            <div className="grid min-w-0 gap-2">
              <Label>PDF resume</Label>
              <div className="flex min-w-0 items-center gap-2">
                <Button type="button" variant="outline" onClick={() => void chooseResumePdf()} disabled={importing}>
                  <FileUp /> Choose PDF
                </Button>
                <span className="min-w-0 truncate text-sm text-muted-foreground" title={importPdfPath || undefined}>
                  {importPdfPath ? getFileName(importPdfPath) : "No PDF selected"}
                </span>
              </div>
              {importError ? <p className="text-sm text-destructive" role="alert">{importError}</p> : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setImportDialogOpen(false)} disabled={importing}>
                Cancel
              </Button>
              <Button type="submit" disabled={importing || !importPdfPath}>
                {importing ? <><LoaderCircle className="animate-spin" /> Importing profile...</> : <><FileUp /> Import into Profile</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || path
}

function ProfileLoading() {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <SidebarTrigger className="md:hidden" aria-label="Open sidebar" />
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="h-4 w-16" />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <Skeleton className="h-36 w-full rounded-xl" />
          <div className="grid gap-6 xl:grid-cols-2">
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </section>
  )
}

function SaveStatus({ state }: { state: "saved" | "saving" | "error" }) {
  if (state === "saving") {
    return <span className="text-xs text-muted-foreground">Saving…</span>
  }
  if (state === "error") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <CircleAlert className="size-3.5" /> Could not save
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Check className="size-3.5 text-status-success" /> Saved locally
    </span>
  )
}

function ProfileMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background/70 px-3 py-2.5">
      <div className="text-lg font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-muted-foreground">{label}</div>
    </div>
  )
}

function BasicsEditor({ profile, onUpdate }: { profile: ProfileDocument; onUpdate: ProfileUpdater }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRound className="size-4 text-muted-foreground" /> Identity
        </CardTitle>
        <CardDescription>
          The personal details shared across your resume-shaped profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="profile-name"
            label="Name"
            value={profile.basics.name}
            placeholder="Your name"
            onChange={(value) => onUpdate((current) => ({
              ...current,
              basics: { ...current.basics, name: value },
            }))}
          />
          <TextField
            id="profile-headline"
            label="Headline"
            value={profile.basics.headline}
            placeholder="Product designer, systems thinker, builder"
            onChange={(value) => onUpdate((current) => ({
              ...current,
              basics: { ...current.basics, headline: value },
            }))}
          />
          <TextField
            id="profile-email"
            label="Email"
            type="email"
            value={profile.basics.email}
            placeholder="you@example.com"
            onChange={(value) => onUpdate((current) => ({
              ...current,
              basics: { ...current.basics, email: value },
            }))}
          />
          <TextField
            id="profile-phone"
            label="Phone"
            type="tel"
            value={profile.basics.phone}
            placeholder="Optional"
            onChange={(value) => onUpdate((current) => ({
              ...current,
              basics: { ...current.basics, phone: value },
            }))}
          />
          <TextField
            id="profile-location"
            label="Location"
            value={profile.basics.location}
            placeholder="Brooklyn, NY · Open to remote"
            onChange={(value) => onUpdate((current) => ({
              ...current,
              basics: { ...current.basics, location: value },
            }))}
          />
          <TextField
            id="profile-website-url"
            label="Primary website"
            type="url"
            value={profile.basics.website.url}
            placeholder="https://your-site.com"
            onChange={(value) => onUpdate((current) => ({
              ...current,
              basics: { ...current.basics, website: { ...current.basics.website, url: value } },
            }))}
          />
        </div>

        <div className="grid gap-4 border-t pt-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <TextField
            id="profile-website-label"
            label="Website label"
            value={profile.basics.website.label}
            placeholder="Portfolio"
            onChange={(value) => onUpdate((current) => ({
              ...current,
              basics: { ...current.basics, website: { ...current.basics.website, label: value } },
            }))}
          />
          <div className="flex items-center gap-3 pb-1">
            <div>
              <Label htmlFor="profile-picture-hidden" className="text-xs">Profile image</Label>
              <p className="mt-1 text-xs text-muted-foreground">Keep the URL for future resume use.</p>
            </div>
            <Switch
              id="profile-picture-hidden"
              checked={!profile.picture.hidden}
              onCheckedChange={(visible) => onUpdate((current) => ({
                ...current,
                picture: { ...current.picture, hidden: !visible },
              }))}
              aria-label="Show profile image"
            />
          </div>
        </div>

        <TextField
          id="profile-picture-url"
          label="Profile image URL"
          type="url"
          value={profile.picture.url}
          placeholder="https://..."
          onChange={(value) => onUpdate((current) => ({
            ...current,
            picture: { ...current.picture, url: value },
          }))}
        />

        <div className="border-t pt-5">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium">Additional links</h3>
              <p className="mt-1 text-xs text-muted-foreground">Extra contact points and public profiles.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onUpdate((current) => ({
                ...current,
                basics: {
                  ...current.basics,
                  customFields: [...current.basics.customFields, createCustomField()],
                },
              }))}
            >
              <Plus /> Add link
            </Button>
          </div>
          {profile.basics.customFields.length ? (
            <div className="space-y-3">
              {profile.basics.customFields.map((field) => (
                <CustomFieldEditor key={field.id} field={field} onUpdate={onUpdate} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
              Add a portfolio, GitHub, calendar link, or another piece of identity context.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function CustomFieldEditor({ field, onUpdate }: { field: CustomField; onUpdate: ProfileUpdater }) {
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[minmax(0,0.65fr)_minmax(0,1fr)_minmax(0,0.45fr)_auto] md:items-end">
      <TextField
        id={`${field.id}-text`}
        label="Label"
        value={field.text}
        placeholder="GitHub"
        onChange={(value) => onUpdate((current) => updateCustomField(current, field.id, { text: value }))}
      />
      <TextField
        id={`${field.id}-link`}
        label="URL or value"
        type="url"
        value={field.link}
        placeholder="https://github.com/..."
        onChange={(value) => onUpdate((current) => updateCustomField(current, field.id, { link: value }))}
      />
      <TextField
        id={`${field.id}-icon`}
        label="Icon key"
        value={field.icon}
        placeholder="github"
        onChange={(value) => onUpdate((current) => updateCustomField(current, field.id, { icon: value }))}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => onUpdate((current) => ({
          ...current,
          basics: {
            ...current.basics,
            customFields: current.basics.customFields.filter((item) => item.id !== field.id),
          },
        }))}
        aria-label={`Remove ${field.text || "link"}`}
        title="Remove link"
      >
        <Trash2 />
      </Button>
    </div>
  )
}

function ContextEditor({ profile, onUpdate }: { profile: ProfileDocument; onUpdate: ProfileUpdater }) {
  const context = profile.profile
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4 text-muted-foreground" /> Company fit
          </CardTitle>
          <CardDescription>
            Describe the roles and companies you want the AI to prioritize.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-6">
          <TextField
            id="profile-target-role"
            label="Target role"
            value={context.targetRole}
            placeholder="Staff product designer"
            onChange={(value) => updateContext(onUpdate, "targetRole", value)}
          />
          <ListField
            id="profile-target-industries"
            label="Target industries"
            value={context.targetIndustries}
            placeholder="Fintech, climate, developer tools"
            onChange={(value) => updateContext(onUpdate, "targetIndustries", value)}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              id="profile-company-size"
              label="Company size"
              value={context.companySize}
              placeholder="Startup, 50–200, enterprise"
              onChange={(value) => updateContext(onUpdate, "companySize", value)}
            />
            <TextField
              id="profile-company-stage"
              label="Company stage"
              value={context.companyStage}
              placeholder="Early, growth, public"
              onChange={(value) => updateContext(onUpdate, "companyStage", value)}
            />
            <TextField
              id="profile-work-arrangement"
              label="Work arrangement"
              value={context.workArrangement}
              placeholder="Remote-first, hybrid"
              onChange={(value) => updateContext(onUpdate, "workArrangement", value)}
            />
            <TextField
              id="profile-location-preference"
              label="Location preference"
              value={context.locationPreference}
              placeholder="NYC, US time zones"
              onChange={(value) => updateContext(onUpdate, "locationPreference", value)}
            />
          </div>
          <TextField
            id="profile-compensation"
            label="Compensation expectations"
            value={context.compensation}
            placeholder="Optional range, equity, or benefits priorities"
            onChange={(value) => updateContext(onUpdate, "compensation", value)}
          />
          <TextAreaField
            id="profile-motivation"
            label="What motivates you"
            value={context.motivation}
            placeholder="The problems, users, and outcomes you want to spend your time on..."
            onChange={(value) => updateContext(onUpdate, "motivation", value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base">
            <Heart className="size-4 text-muted-foreground" /> Cultural alignment
          </CardTitle>
          <CardDescription>
            Give the AI a better sense of where your best work happens.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-6">
          <ListField
            id="profile-strengths"
            label="Strengths to bring forward"
            value={context.strengths}
            placeholder="Facilitation, systems thinking, calm execution"
            onChange={(value) => updateContext(onUpdate, "strengths", value)}
          />
          <ListField
            id="profile-values"
            label="Values"
            value={context.values}
            placeholder="Craft, honesty, usefulness"
            onChange={(value) => updateContext(onUpdate, "values", value)}
          />
          <ListField
            id="profile-environments"
            label="Preferred environments"
            value={context.preferredEnvironments}
            placeholder="High trust, collaborative, low ego"
            onChange={(value) => updateContext(onUpdate, "preferredEnvironments", value)}
          />
          <TextField
            id="profile-management-style"
            label="Management and collaboration style"
            value={context.managementStyle}
            placeholder="How you like to be supported and work with others"
            onChange={(value) => updateContext(onUpdate, "managementStyle", value)}
          />
          <ListField
            id="profile-non-negotiables"
            label="Non-negotiables"
            value={context.nonNegotiables}
            placeholder="Accessible leadership, sustainable pace"
            onChange={(value) => updateContext(onUpdate, "nonNegotiables", value)}
          />
          <ListField
            id="profile-deal-breakers"
            label="Deal-breakers"
            value={context.dealBreakers}
            placeholder="What should make a role a poor fit?"
            onChange={(value) => updateContext(onUpdate, "dealBreakers", value)}
          />
          <TextAreaField
            id="profile-additional-context"
            label="Additional context"
            value={context.additionalContext}
            placeholder="Anything nuanced an AI should know before choosing examples..."
            onChange={(value) => updateContext(onUpdate, "additionalContext", value)}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryEditor({ profile, onUpdate }: { profile: ProfileDocument; onUpdate: ProfileUpdater }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4 text-muted-foreground" /> Career summary
        </CardTitle>
        <CardDescription>
          A durable narrative for the person behind individual resume versions.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6">
        <TextField
          id="profile-summary-title"
          label="Section title"
          value={profile.summary.title}
          placeholder="Summary"
          onChange={(value) => onUpdate((current) => ({
            ...current,
            summary: { ...current.summary, title: value },
          }))}
        />
        <TextAreaField
          id="profile-summary-content"
          label="Summary"
          value={profile.summary.content}
          placeholder="What kind of work do you do, what are you unusually good at, and what thread connects your experience?"
          onChange={(value) => onUpdate((current) => ({
            ...current,
            summary: { ...current.summary, content: value },
          }))}
        />
      </CardContent>
    </Card>
  )
}

function StandardSectionEditor({
  profile,
  config,
  onUpdate,
}: {
  profile: ProfileDocument
  config: SectionConfig
  onUpdate: ProfileUpdater
}) {
  const section = profile.sections[config.key] as ProfileSection
  const Icon = config.icon

  function updateSection(update: (section: ProfileSection) => ProfileSection) {
    onUpdate((current) => {
      const currentSection = current.sections[config.key] as ProfileSection
      return {
        ...current,
        sections: { ...current.sections, [config.key]: update(currentSection) },
      } as ProfileDocument
    })
  }

  return (
    <Card className="overflow-visible">
      <CardHeader className="gap-4 border-b sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
            <Icon className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Input
                id={`profile-section-title-${config.key}`}
                value={section.title}
                onChange={(event) => updateSection((current) => ({ ...current, title: event.currentTarget.value }))}
                className="h-7 min-w-0 border-transparent bg-transparent px-0 text-sm font-semibold shadow-none focus-visible:border-ring focus-visible:px-2"
                aria-label={`${config.label} section title`}
              />
              <Badge variant="secondary" className="shrink-0">{section.items.length}</Badge>
            </div>
            <CardDescription className="mt-1">{config.description}</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:pt-1">
          <Label htmlFor={`profile-section-enabled-${config.key}`} className="text-xs text-muted-foreground">
            Include
          </Label>
          <Switch
            id={`profile-section-enabled-${config.key}`}
            checked={section.enabled}
            onCheckedChange={(enabled) => updateSection((current) => ({ ...current, enabled }))}
            aria-label={`Include ${config.label} in profile`}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {section.items.length ? (
          section.items.map((item, index) => (
            <ItemEditor
              key={item.id}
              config={config}
              item={item}
              index={index}
              onChange={(field, value) => updateSection((current) => ({
                ...current,
                items: current.items.map((candidate) => (
                  candidate.id === item.id ? field.set(candidate, value) : candidate
                )),
              }))}
              onRemove={() => updateSection((current) => ({
                ...current,
                items: current.items.filter((candidate) => candidate.id !== item.id),
              }))}
            />
          ))
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-4 text-sm leading-6 text-muted-foreground">
            {config.emptyDescription}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => updateSection((current) => ({
            ...current,
            enabled: true,
            items: [...current.items, createItem(config.key)],
          }))}
        >
          <Plus /> Add {config.label.toLowerCase().replace(/s$/, "")}
        </Button>
      </CardContent>
    </Card>
  )
}

function ItemEditor({
  config,
  item,
  index,
  onChange,
  onRemove,
}: {
  config: SectionConfig
  item: AnyResumeItem
  index: number
  onChange: (field: ItemField, value: FieldValue) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {config.label} {index + 1}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label={`Remove ${config.label.toLowerCase()} ${index + 1}`}
          title="Remove"
        >
          <Trash2 />
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {config.fields.map((field) => {
          const value = field.get(item)
          const inputId = `profile-${config.key}-${item.id}-${field.key.replace(/\./g, "-")}`

          if (field.kind === "textarea") {
            return (
              <TextAreaField
                key={field.key}
                id={inputId}
                label={field.label}
                value={String(value)}
                placeholder={field.placeholder}
                className="md:col-span-2"
                onChange={(nextValue) => onChange(field, nextValue)}
              />
            )
          }

          if (field.kind === "tags") {
            return (
              <ListField
                key={field.key}
                id={inputId}
                label={field.label}
                value={Array.isArray(value) ? value : []}
                placeholder={field.placeholder}
                onChange={(nextValue) => onChange(field, nextValue)}
              />
            )
          }

          return (
            <TextField
              key={field.key}
              id={inputId}
              label={field.label}
              type={field.kind === "number" ? "number" : "text"}
              value={String(value)}
              placeholder={field.placeholder}
              min={field.kind === "number" ? 0 : undefined}
              max={field.kind === "number" ? 5 : undefined}
              onChange={(nextValue) => onChange(field, field.kind === "number" ? numberValue(nextValue) : nextValue)}
            />
          )
        })}
      </div>
    </div>
  )
}

function CustomSectionsEditor({ profile, onUpdate }: { profile: ProfileDocument; onUpdate: ProfileUpdater }) {
  return (
    <Card>
      <CardHeader className="border-b sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">Custom sections</CardTitle>
          <CardDescription className="mt-1">
            Advanced resume-schema sections for context that does not fit the standard categories.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onUpdate((current) => ({
            ...current,
            customSections: [...current.customSections, createCustomSection()],
          }))}
        >
          <Plus /> Add section
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {profile.customSections.length ? profile.customSections.map((section) => (
          <CustomSectionEditor key={section.id} section={section} onUpdate={onUpdate} />
        )) : (
          <p className="rounded-lg border border-dashed px-3 py-4 text-sm leading-6 text-muted-foreground">
            Add a custom section when you need to preserve a category outside the usual resume sections.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function CustomSectionEditor({ section, onUpdate }: { section: CustomSection; onUpdate: ProfileUpdater }) {
  const [itemsText, setItemsText] = useState(() => JSON.stringify(section.items, null, 2))

  useEffect(() => {
    setItemsText(JSON.stringify(section.items, null, 2))
  }, [section.items])

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-end">
        <TextField
          id={`${section.id}-title`}
          label="Section title"
          value={section.title}
          placeholder="Selected work"
          onChange={(value) => onUpdate((current) => updateCustomSection(current, section.id, { title: value }))}
        />
        <div className="grid gap-2">
          <Label htmlFor={`${section.id}-type`}>Schema type</Label>
          <NativeSelect
            id={`${section.id}-type`}
            value={section.type}
            onChange={(event) => onUpdate((current) => updateCustomSection(current, section.id, {
              type: event.currentTarget.value as CustomSection["type"],
            }))}
          >
            <NativeSelectOption value="summary">Summary</NativeSelectOption>
            <NativeSelectOption value="profiles">Profiles</NativeSelectOption>
            <NativeSelectOption value="experience">Experience</NativeSelectOption>
            <NativeSelectOption value="education">Education</NativeSelectOption>
            <NativeSelectOption value="projects">Projects</NativeSelectOption>
            <NativeSelectOption value="skills">Skills</NativeSelectOption>
            <NativeSelectOption value="languages">Languages</NativeSelectOption>
            <NativeSelectOption value="interests">Interests</NativeSelectOption>
            <NativeSelectOption value="awards">Awards</NativeSelectOption>
            <NativeSelectOption value="certifications">Certifications</NativeSelectOption>
            <NativeSelectOption value="publications">Publications</NativeSelectOption>
            <NativeSelectOption value="volunteer">Volunteer</NativeSelectOption>
            <NativeSelectOption value="references">References</NativeSelectOption>
            <NativeSelectOption value="cover-letter">Cover letter</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Label htmlFor={`${section.id}-enabled`} className="text-xs text-muted-foreground">Include</Label>
          <Switch
            id={`${section.id}-enabled`}
            checked={section.enabled}
            onCheckedChange={(enabled) => onUpdate((current) => updateCustomSection(current, section.id, { enabled }))}
            aria-label={`Include ${section.title || "custom section"}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onUpdate((current) => ({
              ...current,
              customSections: current.customSections.filter((item) => item.id !== section.id),
            }))}
            aria-label={`Remove ${section.title || "custom section"}`}
            title="Remove section"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${section.id}-items`}>Items JSON</Label>
        <Textarea
          id={`${section.id}-items`}
          value={itemsText}
          rows={6}
          onChange={(event) => {
            const nextText = event.currentTarget.value
            setItemsText(nextText)
            try {
              const parsed: unknown = JSON.parse(nextText)
              if (Array.isArray(parsed)) {
                onUpdate((current) => updateCustomSection(current, section.id, { items: parsed as AnyResumeItem[] }))
              }
            } catch {
              // Wait for valid JSON while the user is editing the advanced field.
            }
          }}
        />
        <p className="text-xs text-muted-foreground">
          This field accepts the same item objects as the resume JSON schema.
        </p>
      </div>
    </div>
  )
}

function MetadataEditor({ profile, onUpdate }: { profile: ProfileDocument; onUpdate: ProfileUpdater }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-base">Resume metadata</CardTitle>
        <CardDescription>
          Presentation metadata stays attached to the profile so future resume versions can reuse it.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="profile-template">Default template</Label>
          <NativeSelect
            id="profile-template"
            value={profile.metadata.template}
            onChange={(event) => onUpdate((current) => ({
              ...current,
              metadata: { ...current.metadata, template: event.currentTarget.value as typeof current.metadata.template },
            }))}
          >
            <NativeSelectOption value="cyndaquil">Cyndaquil</NativeSelectOption>
            <NativeSelectOption value="mewtwo">Mewtwo</NativeSelectOption>
          </NativeSelect>
        </div>
        <TextAreaField
          id="profile-metadata-notes"
          label="Metadata notes"
          value={profile.metadata.notes}
          placeholder="Notes for future resume versions..."
          onChange={(value) => onUpdate((current) => ({
            ...current,
            metadata: { ...current.metadata, notes: value },
          }))}
        />
      </CardContent>
    </Card>
  )
}

function TextField({
  id,
  label,
  value,
  placeholder,
  type = "text",
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder?: string
  type?: "text" | "email" | "tel" | "url" | "number"
  min?: number
  max?: number
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        min={min}
        max={max}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  )
}

function TextAreaField({
  id,
  label,
  value,
  placeholder,
  className,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder?: string
  className?: string
  onChange: (value: string) => void
}) {
  return (
    <div className={`grid gap-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        placeholder={placeholder}
        rows={4}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  )
}

function ListField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  value: string[]
  placeholder?: string
  onChange: (value: string[]) => void
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value.join(", ")}
        placeholder={placeholder}
        onChange={(event) => onChange(parseList(event.currentTarget.value))}
      />
      <p className="text-xs text-muted-foreground">Separate entries with commas.</p>
    </div>
  )
}

function simpleField(key: string, label: string, kind: FieldKind, placeholder?: string): ItemField {
  return {
    key,
    label,
    kind,
    placeholder,
    get: (item) => fieldValue((item as unknown as Record<string, unknown>)[key]),
    set: (item, value) => ({ ...item, [key]: value } as AnyResumeItem),
  }
}

function websiteField(label: string, placeholder: string): ItemField {
  return {
    key: "website.url",
    label,
    kind: "text",
    placeholder,
    get: (item) => {
      const website = (item as unknown as Record<string, unknown>).website
      return fieldValue(asRecord(website).url)
    },
    set: (item, value) => {
      const record = item as unknown as Record<string, unknown>
      return {
        ...item,
        website: { ...asRecord(record.website), url: String(value) },
      } as AnyResumeItem
    },
  }
}

function fieldValue(value: unknown): FieldValue {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string")
  if (typeof value === "number" && Number.isFinite(value)) return value
  return typeof value === "string" ? value : ""
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function parseList(value: string): string[] {
  return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)
}

function numberValue(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(5, Math.max(0, parsed)) : 0
}

function updateContext<K extends keyof ProfileContext>(onUpdate: ProfileUpdater, key: K, value: ProfileContext[K]) {
  onUpdate((current) => ({
    ...current,
    profile: { ...current.profile, [key]: value },
  }))
}

function createCustomField(): CustomField {
  return { id: createId("custom-field"), icon: "", text: "", link: "" }
}

function updateCustomField(profile: ProfileDocument, id: string, patch: Partial<CustomField>): ProfileDocument {
  return {
    ...profile,
    basics: {
      ...profile.basics,
      customFields: profile.basics.customFields.map((field) => field.id === id ? { ...field, ...patch } : field),
    },
  }
}

function updateCustomSection(profile: ProfileDocument, id: string, patch: Partial<CustomSection>): ProfileDocument {
  return {
    ...profile,
    customSections: profile.customSections.map((section) => section.id === id ? { ...section, ...patch } : section),
  }
}

function createCustomSection(): CustomSection {
  const item: SummaryItem = { id: createId("custom-item"), hidden: false, content: "" }
  return {
    id: createId("custom-section"),
    title: "Custom section",
    icon: "",
    columns: 1,
    alignment: "left",
    pageAlignment: "left",
    enabled: true,
    hidden: false,
    keepTogether: false,
    startOnNewPage: false,
    type: "summary",
    items: [item],
  }
}

function createItem(key: ProfileSectionKey): AnyResumeItem {
  const base = { id: createId(`${key}-item`), hidden: false }
  switch (key) {
    case "profiles": return { ...base, icon: "", iconColor: "", network: "", username: "", website: emptyItemWebsite() }
    case "experience": return { ...base, company: "", position: "", location: "", period: "", website: emptyItemWebsite(), description: "", roles: [] }
    case "education": return { ...base, school: "", degree: "", area: "", grade: "", location: "", period: "", website: emptyItemWebsite(), description: "" }
    case "projects": return { ...base, name: "", period: "", website: emptyItemWebsite(), description: "" }
    case "skills": return { ...base, icon: "", iconColor: "", name: "", proficiency: "", level: 0, keywords: [] }
    case "languages": return { ...base, language: "", fluency: "", level: 0 }
    case "interests": return { ...base, icon: "", iconColor: "", name: "", keywords: [] }
    case "awards": return { ...base, title: "", awarder: "", date: "", website: emptyItemWebsite(), description: "" }
    case "certifications": return { ...base, title: "", issuer: "", date: "", website: emptyItemWebsite(), description: "" }
    case "publications": return { ...base, title: "", publisher: "", date: "", website: emptyItemWebsite(), description: "" }
    case "volunteer": return { ...base, organization: "", location: "", period: "", website: emptyItemWebsite(), description: "" }
    case "references": return { ...base, name: "", position: "", website: emptyItemWebsite(), phone: "", description: "" }
  }
}

function emptyItemWebsite() {
  return { url: "", label: "", inlineLink: false }
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
