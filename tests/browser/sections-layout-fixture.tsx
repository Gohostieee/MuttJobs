import { createRoot } from "react-dom/client"
import { ResumeSectionsSidebar, ResumeViewer, ResumeWorkspace } from "../../src/components/resume-workspace"
import { getResumeSectionEntries } from "../../src/components/resume-document"
import { normalizeAndValidateResume } from "../../src/lib/resume-validation"
import "../../src/App.css"

export function renderLibrary() {
  document.getElementById("root")?.remove()
  const container = document.createElement("div")
  document.body.append(container)
  createRoot(container).render(<ResumeWorkspace />)
}

export async function renderViewer() {
  document.getElementById("root")?.remove()
  const container = document.createElement("div")
  document.body.append(container)
  const data = normalizeAndValidateResume(await (await fetch('/sample-resume.json')).json())
  createRoot(container).render(<ResumeViewer file={{id:"source",path:"Preview sample",fileName:"original.json",updatedAt:0,data}} onBack={() => {}} />)
}

export async function renderSections(width: number) {
  document.getElementById("root")?.remove()
  const container = document.createElement("div")
  container.style.cssText = `width:${width}px;position:absolute;right:0;top:0`
  document.body.append(container)
  const resume = normalizeAndValidateResume(await (await fetch('/sample-resume.json')).json())
  const noop = () => {}
  createRoot(container).render(<ResumeSectionsSidebar resume={resume} sections={getResumeSectionEntries(resume, {includeHidden:true})}
    onSelect={noop} onReorder={noop} onAdd={noop} onChange={noop} onRemove={noop} onToggleHidden={noop}
    onColumnsChange={noop} onTextAlignmentChange={noop} onPageAlignmentChange={noop} onAddItem={noop}
    onRemoveItem={noop} onToggleItemHidden={noop} onReorderItem={noop} onToggle={noop} />)
}
