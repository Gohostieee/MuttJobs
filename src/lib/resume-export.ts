import { invoke } from "@tauri-apps/api/core"

export async function exportResumePdf(path: string): Promise<void> {
  await invoke("export_resume_pdf", { path })
}
