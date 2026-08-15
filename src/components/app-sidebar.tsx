import { useEffect, useState } from "react"
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  ContactRound,
  FileText,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"

export type AppTabId =
  | "overview"
  | "jobs"
  | "applications"
  | "interviews"
  | "contacts"
  | "resumes"
  | "settings"

export type AppTab = {
  id: AppTabId
  label: string
  description: string
  icon: LucideIcon
}

export const APP_TABS: AppTab[] = [
  {
    id: "overview",
    label: "Overview",
    description: "See your job search at a glance.",
    icon: LayoutDashboard,
  },
  {
    id: "jobs",
    label: "Job Board",
    description: "Discover and save promising roles.",
    icon: Briefcase,
  },
  {
    id: "applications",
    label: "Applications",
    description: "Track every application and next step.",
    icon: BarChart3,
  },
  {
    id: "interviews",
    label: "Interviews",
    description: "Prepare for upcoming conversations.",
    icon: CalendarDays,
  },
  {
    id: "contacts",
    label: "Contacts",
    description: "Keep recruiters and connections organized.",
    icon: ContactRound,
  },
  {
    id: "resumes",
    label: "Resumes",
    description: "Browse and review your saved resumes.",
    icon: FileText,
  },
]

type AppSidebarProps = {
  activeTab: AppTabId
  onSelectTab: (tab: AppTabId) => void
}

export function AppSidebar({ activeTab, onSelectTab }: AppSidebarProps) {
  const { isMobile, setOpen, setOpenMobile, state, toggleSidebar } = useSidebar()
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function selectTab(tab: AppTabId) {
    onSelectTab(tab)
    setSearchOpen(false)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <>
      <Sidebar collapsible="icon" className="border-sidebar-border/70">
        <SidebarHeader className="gap-3 px-3 pb-1 pt-3">
          <div className="flex h-9 items-center gap-2 px-1">
            {state === "collapsed" && !isMobile ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                onClick={() => setOpen(true)}
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen />
              </Button>
            ) : (
              <>
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-[11px] font-bold tracking-tighter text-background">
                  MJ
                </div>
                <span className="truncate text-[15px] font-semibold tracking-tight">
                  muttjobs
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto text-muted-foreground"
                  onClick={toggleSidebar}
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose />
                </Button>
              </>
            )}
          </div>

          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="h-9 text-muted-foreground"
                tooltip="Search tabs"
                onClick={() => setSearchOpen(true)}
              >
                <Search />
                <span>Search</span>
                <kbd className="ml-auto rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                  Ctrl K
                </kbd>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup className="px-3 pt-2">
            <SidebarGroupLabel className="px-1 text-[11px] uppercase tracking-[0.12em]">
              Workspace
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {APP_TABS.map((tab) => {
                  const Icon = tab.icon
                  const isActive = activeTab === tab.id

                  return (
                    <SidebarMenuItem key={tab.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={tab.label}
                        className="h-9 gap-2.5 data-active:bg-sidebar-accent/70"
                        onClick={() => selectTab(tab.id)}
                      >
                        <Icon className="text-muted-foreground" />
                        <span className="font-medium">{tab.label}</span>
                        {isActive ? (
                          <span className="absolute left-0 size-1.5 rounded-full bg-primary" />
                        ) : null}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="px-3 pb-3">
          <SidebarSeparator className="mx-0 mb-1" />
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Settings"
                className="text-muted-foreground"
                isActive={activeTab === "settings"}
                onClick={() => selectTab("settings")}
              >
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search tabs"
        description="Jump to a MuttJobs workspace"
      >
        <Command>
          <CommandInput placeholder="Search tabs..." autoFocus />
          <CommandList>
            <CommandEmpty>No tabs found.</CommandEmpty>
            <CommandGroup heading="Workspace">
              {APP_TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <CommandItem
                    key={tab.id}
                    value={`${tab.label} ${tab.description}`}
                    onSelect={() => selectTab(tab.id)}
                  >
                    <Icon className="text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate">{tab.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {tab.description}
                      </p>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
