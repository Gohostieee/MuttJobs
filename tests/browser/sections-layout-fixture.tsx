import { createRoot } from "react-dom/client"
import { ResumeSectionsSidebar } from "../../src/components/resume-workspace"
import { getResumeSectionEntries } from "../../src/components/resume-document"
import { normalizeAndValidateResume } from "../../src/lib/resume-validation"
import "../../src/App.css"

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
