import { createRoot, type Root } from "react-dom/client"
import { ResumeDocument } from "../../src/components/resume-document"
import { CoverLetterDocument } from "../../src/components/cover-letter-document"
import { normalizeAndValidateResume } from "../../src/lib/resume-validation"
import { normalizeAndValidateCoverLetter } from "../../src/lib/cover-letter-validation"

let root: Root | undefined

/** Test-only entry served by Vite; uses the same components and normalization as review. */
export function renderDocument(data: unknown, artifact: string) {
  root?.unmount()
  document.getElementById("live-layout-fixture")?.remove()
  const container = document.createElement("div")
  container.id = "live-layout-fixture"
  container.className = "creation-document-preview"
  container.style.cssText = "position:absolute;left:0;top:0;width:1000px;z-index:9999;background:white"
  document.body.append(container)
  root = createRoot(container)
  root.render(artifact === "resume"
    ? <ResumeDocument resume={normalizeAndValidateResume(data)} />
    : <CoverLetterDocument letter={normalizeAndValidateCoverLetter(data)} />)
}
