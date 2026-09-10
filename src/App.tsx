import { useEffect, useState, type CSSProperties } from "react"

import {
  APP_TABS,
  AppSidebar,
  type AppTabId,
} from "@/components/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { ResumeWorkspace } from "@/components/resume-workspace"
import { CoverLetterWorkspace } from "@/components/cover-letter-workspace"
import { SettingsWorkspace } from "@/components/settings-workspace"
import { JobSearchWorkspace } from "@/components/job-search-workspace"
import { ApplicationsWorkspace } from "@/components/applications-workspace"
import { ProfileWorkspace } from "@/components/profile-workspace"
import { AgentWorkspace } from "@/components/agent-workspace"
import "./App.css"

function isAppTab(value: unknown): value is AppTabId {
  return value === "settings" || APP_TABS.some(tab => tab.id === value)
}

function App() {
  const [activeTab, setActiveTab] = useState<AppTabId>(() => {
    const stored = localStorage.getItem("muttjobs.active-tab")
    return isAppTab(stored) ? stored : "applications"
  })
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false)
  useEffect(() => { const navigate = (event: Event) => { const tab = (event as CustomEvent).detail; if (isAppTab(tab)) { localStorage.setItem("muttjobs.active-tab", tab); setActiveTab(tab) } }; window.addEventListener("muttjobs:navigate", navigate); return () => window.removeEventListener("muttjobs:navigate", navigate) }, [])
  const showAppSidebar = !documentViewerOpen

  return (
    <SidebarProvider
      className="h-svh overflow-hidden"
      defaultOpen
      style={{ "--sidebar-width": "17.5rem" } as CSSProperties}
    >
      {showAppSidebar ? <AppSidebar activeTab={activeTab} onSelectTab={tab => { localStorage.setItem("muttjobs.active-tab", tab); setActiveTab(tab) }} /> : null}
      <SidebarInset className="h-full min-h-0 min-w-0 overflow-hidden">
        {showAppSidebar && activeTab !== "profile" && activeTab !== "settings" ? (
          <header className="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
            <SidebarTrigger aria-label="Open sidebar" />
          </header>
        ) : null}
        <TabWorkspace activeTab={activeTab} onDocumentViewerChange={setDocumentViewerOpen} />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App

function TabWorkspace({
  activeTab,
  onDocumentViewerChange,
}: {
  activeTab: AppTabId
  onDocumentViewerChange: (open: boolean) => void
}) {
  if (activeTab === "resumes") return <ResumeWorkspace onViewerChange={onDocumentViewerChange} />
  if (activeTab === "cover-letters") return <CoverLetterWorkspace onViewerChange={onDocumentViewerChange} />
  if (activeTab === "settings") return <SettingsWorkspace />
  if (activeTab === "jobs") return <JobSearchWorkspace />
  if (activeTab === "applications") {
    return <ApplicationsWorkspace onDocumentViewerChange={onDocumentViewerChange} />
  }
  if (activeTab === "profile") return <ProfileWorkspace />
  return <AgentWorkspace />
}
