import { sanitizeRichTextHtml } from "@/lib/rich-text"

export const MAX_RESUME_SELECTION_CODE_POINTS = 4_000

export type ResumePath = Array<string | number>

/**
 * The persisted, provider-facing identity of one selected rich-text range.
 * Offsets are Unicode code-point offsets into the rendered plain text of the
 * field, never UTF-16 DOM offsets.
 */
export type ResumeTextSelection = {
  fieldPath: ResumePath
  sectionKey: string
  itemId?: string
  selectedText: string
  startOffset: number
  endOffset: number
  fieldContentHash: string
  htmlFragment?: string
}

export type ResumeTextSelectionContext = {
  fieldPath: ResumePath
  sectionKey: string
  itemId?: string
}

export type ResumeSelectionAction =
  | "improve"
  | "make-concise"
  | "strengthen-bullet"
  | "quantify-impact"
  | "custom"

export type ResumeSelectionGeometry = {
  left: number
  top: number
  width: number
  height: number
}

export type ResumeTextSelectionCandidate = {
  selection: ResumeTextSelection
  geometry: ResumeSelectionGeometry
}

export type ResumeSelectionActionDefinition = {
  id: ResumeSelectionAction
  label: string
  prompt?: string
  description: string
}

export const RESUME_SELECTION_ACTIONS: ResumeSelectionActionDefinition[] = [
  {
    id: "improve",
    label: "Improve",
    prompt: "Improve the selected resume text while preserving its meaning and every factual claim.",
    description: "Improve wording without changing the facts.",
  },
  {
    id: "make-concise",
    label: "Make concise",
    prompt: "Make the selected resume text more concise without removing factual meaning or changing its claims.",
    description: "Tighten the wording and keep the meaning.",
  },
  {
    id: "strengthen-bullet",
    label: "Strengthen bullet",
    prompt: "Strengthen the selected resume bullet with clear, action-oriented wording. Do not add facts, metrics, technologies, scope, or outcomes.",
    description: "Use sharper action-oriented language.",
  },
  {
    id: "quantify-impact",
    label: "Quantify impact",
    prompt: "Review the selected resume text and return a short prioritized list of questions that could uncover factual evidence or metrics. Do not edit or write the resume.",
    description: "Ask evidence-based questions without guessing metrics.",
  },
  {
    id: "custom",
    label: "Edit with instruction…",
    description: "Open the AI assistant with this exact passage attached.",
  },
]

const BLOCK_TAGS = new Set(["P", "DIV", "BLOCKQUOTE", "UL", "OL", "LI"])

type NodePosition = {
  start: number
  contentEnd: number
  end: number
  childStarts: number[]
  childContentEnds: number[]
}

type RenderedTextModel = {
  text: string
  positions: Map<Node, NodePosition>
}

/** Convert a DOM rich-text root to the same plain-text representation used by selection offsets. */
export function renderedRichTextPlainText(root: Node) {
  return buildRenderedTextModel(root).text
}

/**
 * Capture the current browser range when it is wholly inside one editor.
 * Returning null is intentional for collapsed, cross-root, or ambiguous
 * selections so callers can safely clear any previously active selection.
 */
export async function captureResumeTextSelection(
  root: HTMLElement,
  context: ResumeTextSelectionContext,
): Promise<ResumeTextSelectionCandidate | null> {
  const view = root.ownerDocument.defaultView
  const browserSelection = view?.getSelection() ?? null
  if (!browserSelection || browserSelection.rangeCount !== 1 || browserSelection.isCollapsed) return null

  const range = browserSelection.getRangeAt(0)
  if (!containsBoundary(root, range.startContainer) || !containsBoundary(root, range.endContainer)) return null

  const model = buildRenderedTextModel(root)
  const startOffset = getBoundaryOffset(model, range.startContainer, range.startOffset)
  const endOffset = getBoundaryOffset(model, range.endContainer, range.endOffset)
  if (startOffset === null || endOffset === null || startOffset >= endOffset) return null

  const selectedText = codePointSlice(model.text, startOffset, endOffset)
  if (!selectedText || codePointLength(selectedText) > MAX_RESUME_SELECTION_CODE_POINTS) return null

  // The DOM selection is a useful safety check, but the persisted value must
  // always be reconstructed from our normalized traversal and offsets.
  if (normalizeSelectionText(browserSelection.toString()) !== normalizeSelectionText(selectedText)) return null

  const fieldHtml = sanitizeRichTextHtml(root.innerHTML)
  const fieldContentHash = await sha256Hex(fieldHtml)
  const htmlFragment = serializeSelectionFragment(root, range)
  const rect = typeof range.getBoundingClientRect === "function"
    ? range.getBoundingClientRect()
    : { left: 0, top: 0, width: 0, height: 0 }
  const rootRect = typeof root.getBoundingClientRect === "function"
    ? root.getBoundingClientRect()
    : { left: 0, top: 0 }

  return {
    selection: {
      fieldPath: [...context.fieldPath],
      sectionKey: context.sectionKey,
      ...(context.itemId ? { itemId: context.itemId } : {}),
      selectedText,
      startOffset,
      endOffset,
      fieldContentHash,
      ...(htmlFragment ? { htmlFragment } : {}),
    },
    geometry: {
      left: rect.left - rootRect.left,
      top: rect.top - rootRect.top,
      width: rect.width,
      height: rect.height,
    },
  }
}

export function normalizeSelectionText(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ")
}

export function codePointLength(value: string) {
  return Array.from(value).length
}

export function codePointSlice(value: string, start: number, end?: number) {
  return Array.from(value).slice(start, end).join("")
}

/** A small, dependency-free SHA-256 implementation keeps capture testable in browser and webview runtimes. */
export async function sha256Hex(value: string) {
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    try {
      const bytes = new TextEncoder().encode(value)
      const digest = await subtle.digest("SHA-256", bytes)
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
    } catch {
      // Fall through to the synchronous implementation for restricted webviews.
    }
  }
  return sha256HexSync(value)
}

function buildRenderedTextModel(root: Node): RenderedTextModel {
  const characters: string[] = []
  const positions = new Map<Node, NodePosition>()

  const appendBoundary = () => {
    if (characters.length && characters[characters.length - 1] !== "\n") characters.push("\n")
  }

  const appendText = (value: string) => {
    for (const character of normalizeSelectionText(value)) characters.push(character)
  }

  const visit = (node: Node, isRoot = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const start = characters.length
      appendText(node.nodeValue || "")
      const end = characters.length
      positions.set(node, { start, contentEnd: end, end, childStarts: [], childContentEnds: [] })
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return

    const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : null
    const tagName = element?.tagName.toUpperCase() || ""
    if (!isRoot && BLOCK_TAGS.has(tagName)) appendBoundary()
    const start = characters.length

    if (tagName === "BR") appendBoundary()

    const childStarts: number[] = []
    const childContentEnds: number[] = []
    Array.from(node.childNodes).forEach((child) => {
      visit(child)
      const position = positions.get(child)
      childStarts.push(position?.start ?? characters.length)
      childContentEnds.push(position?.contentEnd ?? characters.length)
    })

    const contentEnd = characters.length
    if (!isRoot && BLOCK_TAGS.has(tagName)) appendBoundary()
    const end = characters.length
    positions.set(node, { start, contentEnd, end, childStarts, childContentEnds })
  }

  visit(root, true)
  while (characters[characters.length - 1] === "\n") characters.pop()
  const length = characters.length
  for (const position of positions.values()) {
    position.start = Math.min(position.start, length)
    position.contentEnd = Math.min(position.contentEnd, length)
    position.end = Math.min(position.end, length)
    position.childStarts = position.childStarts.map((value) => Math.min(value, length))
    position.childContentEnds = position.childContentEnds.map((value) => Math.min(value, length))
  }

  return { text: characters.join(""), positions }
}

function containsBoundary(root: Node, node: Node) {
  return node === root || root.contains(node)
}

function getBoundaryOffset(model: RenderedTextModel, container: Node, offset: number) {
  const position = model.positions.get(container)
  if (!position) return null

  if (container.nodeType === Node.TEXT_NODE) {
    const text = container.nodeValue || ""
    const utf16Offset = Math.max(0, Math.min(offset, text.length))
    return position.start + codePointLength(normalizeSelectionText(text.slice(0, utf16Offset)))
  }

  const childIndex = Math.max(0, Math.min(offset, position.childStarts.length))
  if (childIndex < position.childStarts.length) return position.childStarts[childIndex]
  if (position.childContentEnds.length) return position.childContentEnds[position.childContentEnds.length - 1]
  return position.start
}

function serializeSelectionFragment(root: HTMLElement, range: Range) {
  const wrapper = root.ownerDocument.createElement("div")
  wrapper.appendChild(range.cloneContents())
  const sanitized = sanitizeRichTextHtml(wrapper.innerHTML)
  return /<(?:p|br|div|blockquote|ul|ol|li|strong|b|em|i|u|a)(?:\s|>)/i.test(sanitized) ? sanitized : undefined
}

function sha256HexSync(value: string) {
  const data = new TextEncoder().encode(value)
  const bitLength = data.length * 8
  const paddedLength = Math.ceil((data.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(data)
  padded[data.length] = 0x80
  const paddedView = new DataView(padded.buffer)
  paddedView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000))
  paddedView.setUint32(paddedLength - 4, bitLength >>> 0)

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
    0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
    0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
    0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
    0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]

  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(64)
    for (let index = 0; index < 16; index += 1) words[index] = paddedView.getUint32(offset + index * 4)
    for (let index = 16; index < 64; index += 1) {
      const value = words[index - 15]
      const value2 = words[index - 2]
      const sigma0 = ((value >>> 7) | (value << 25)) ^ ((value >>> 18) | (value << 14)) ^ (value >>> 3)
      const sigma1 = ((value2 >>> 17) | (value2 << 15)) ^ ((value2 >>> 19) | (value2 << 13)) ^ (value2 >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const choice = (e & f) ^ (~e & g)
      const temp1 = (h + sigma1 + choice + constants[index] + words[index]) >>> 0
      const sigma0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sigma0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }

  return hash.map((value) => value.toString(16).padStart(8, "0")).join("")
}
