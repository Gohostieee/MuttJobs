import { useState, type CSSProperties } from "react"

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
import { SettingsWorkspace } from "@/components/settings-workspace"
import "./App.css"

function App() {
  const [activeTab, setActiveTab] = useState<AppTabId>("overview")

  return (
    <SidebarProvider
      defaultOpen
      style={{ "--sidebar-width": "17.5rem" } as CSSProperties}
    >
      <AppSidebar activeTab={activeTab} onSelectTab={setActiveTab} />
      <SidebarInset className="min-h-svh overflow-hidden">
        <header className="flex h-12 shrink-0 items-center border-b px-3 md:hidden">
          <SidebarTrigger aria-label="Open sidebar" />
        </header>
        <TabWorkspace activeTab={activeTab} />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App

function TabWorkspace({ activeTab }: { activeTab: AppTabId }) {
  if (activeTab === "resumes") return <ResumeWorkspace />
  if (activeTab === "settings") return <SettingsWorkspace />

  const tab =
    APP_TABS.find((candidate) => candidate.id === activeTab)

  return (
    <main className="flex flex-1 flex-col bg-background">
      <header className="border-b px-6 py-5 md:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Workspace
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{tab?.label}</h1>
      </header>
      <section className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 size-2 rounded-full bg-primary" />
          <h2 className="text-base font-medium tracking-tight">{tab?.label}</h2>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {tab?.description}
          </p>
        </div>
      </section>
    </main>
  )
}
