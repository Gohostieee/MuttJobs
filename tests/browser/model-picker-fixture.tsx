import { createRoot } from "react-dom/client"
import { useState } from "react"
import { DEFAULT_RESUME_AI_SELECTION, ModelReasoningSelector } from "../../src/components/resume-ai-sidebar"
import "../../src/App.css"
import "../../src/components/resume-targets-panel.css"

function Fixture() {
  const [value, onChange] = useState(DEFAULT_RESUME_AI_SELECTION)
  return <div className="resume-targets-controls"><div className="resume-targets-model"><ModelReasoningSelector value={value} onChange={onChange} showServiceTier={false} /></div></div>
}

export function renderPicker() {
  document.getElementById("root")?.remove()
  const container = document.createElement("div")
  container.style.cssText = "width:320px;margin:40px 20px"
  document.body.append(container)
  createRoot(container).render(<Fixture />)
}
