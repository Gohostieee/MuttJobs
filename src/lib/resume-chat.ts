type ChatTurn = { role: "user" | "assistant"; text: string; error?: string; streaming?: boolean }

/** Each desktop worker starts a fresh turn; carry recent dialogue explicitly. */
export function buildResumeChatPrompt(turns: ChatTurn[], request: string): string {
  const encoder = new TextEncoder()
  const requestBytes = encoder.encode(request).length
  if (requestBytes > 16000) {
    throw new Error("This message is too long. Please shorten it and try again.")
  }
  const recent: string[] = []
  const contextBudget = Math.min(12000, 19000 - requestBytes)
  let size = 0
  for (const turn of [...turns].reverse()) {
    if (turn.streaming || turn.error || !turn.text) continue
    const entry = JSON.stringify({ role: turn.role, text: turn.text })
    const bytes = encoder.encode(entry).length
    if (size + bytes > contextBudget) break
    recent.unshift(entry)
    size += bytes
  }
  if (!recent.length) return request
  return `Recent conversation for context only (previous requests have already been handled):\n${recent.join("\n")}\n\nCurrent request:\n${request}`
}
