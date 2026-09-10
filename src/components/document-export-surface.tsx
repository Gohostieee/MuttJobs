import type { ReactNode } from "react"
import { createPortal } from "react-dom"

// Keep print pagination outside the app's fixed-height, clipped workspace shells.
export function DocumentExportSurface({ children }: { children: ReactNode }) {
  return createPortal(<div className="resume-export-root" aria-hidden="true">{children}</div>, document.body)
}
