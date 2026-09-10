import type { ReactNode } from "react"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

export function WorkspaceHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <header className="flex shrink-0 flex-col gap-4 border-b px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
    <div className="min-w-0 max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
    {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
  </header>
}

export function WorkspaceEmpty({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <Empty className="min-h-48">
    <EmptyHeader><EmptyTitle role="heading" aria-level={2}>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader>
    {children ? <EmptyContent>{children}</EmptyContent> : null}
  </Empty>
}
