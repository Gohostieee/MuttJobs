const ALLOWED_TAGS = new Set(["P", "BR", "DIV", "BLOCKQUOTE", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "U", "A"])
const LEGACY_BULLET_MARKER = /^\s*\u2022[ \t]+/
const LEGACY_LIST_MARKER = /^\s*(?:(?:[*+\-])|(?:\d+[.)]))[ \t]+/

type ListTag = "ul" | "ol"

/**
 * Keep rich text safe and normalize the paragraph-based list format used by
 * older/imported resume JSON into real HTML lists.
 */
export function sanitizeRichTextHtml(value: string) {
  if (typeof DOMParser === "undefined" || typeof document === "undefined") return value

  const source = new DOMParser().parseFromString(value, "text/html")
  const output = document.createElement("div")

  copyChildren(source.body, output)
  convertLegacyListParagraphs(output)
  return output.innerHTML
}

function copyChildren(sourceNode: Node, target: Node) {
  sourceNode.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(child.textContent || ""))
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return

    const sourceElement = child as HTMLElement
    const tagName = sourceElement.tagName.toUpperCase()
    if (!ALLOWED_TAGS.has(tagName)) {
      copyChildren(sourceElement, target)
      return
    }

    const element = document.createElement(tagName.toLowerCase())
    if (tagName === "A") {
      const href = normalizeHref(sourceElement.getAttribute("href") || "")
      if (href) element.setAttribute("href", href)
    }
    copyChildren(sourceElement, element)
    target.appendChild(element)
  })
}

function convertLegacyListParagraphs(container: HTMLElement) {
  const output = container.ownerDocument.createDocumentFragment()
  let list: HTMLUListElement | HTMLOListElement | null = null
  let listType: ListTag | null = null

  const flushList = () => {
    if (list) output.appendChild(list)
    list = null
    listType = null
  }

  for (const child of Array.from(container.childNodes)) {
    if (list && isWhitespaceText(child)) continue

    if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as HTMLElement
      const marker = getLegacyListMarker(element)
      if (marker) {
        if (!list || listType !== marker.type) {
          flushList()
          list = container.ownerDocument.createElement(marker.type)
          listType = marker.type
        }

        const item = container.ownerDocument.createElement("li")
        removeLeadingText(element, marker.length)
        while (element.firstChild) item.appendChild(element.firstChild)
        list.appendChild(item)
        continue
      }

      // Imported JSON often puts an empty paragraph between bullet points.
      // Treat it as list spacing instead of creating separate one-item lists.
      if (list && isEmptyBlock(element)) continue
    }

    flushList()
    output.appendChild(child)
  }

  flushList()
  container.replaceChildren(output)
}

function getLegacyListMarker(element: HTMLElement): { type: ListTag; length: number } | null {
  if (!["P", "DIV"].includes(element.tagName)) return null
  const text = element.textContent || ""
  const match = text.match(LEGACY_LIST_MARKER) || text.match(LEGACY_BULLET_MARKER)
  if (!match) return null
  return { type: /^\s*\d/.test(match[0]) ? "ol" : "ul", length: match[0].length }
}

function removeLeadingText(element: HTMLElement, length: number) {
  const walker = element.ownerDocument.createTreeWalker(element, 4)
  let remaining = length
  let node = walker.nextNode()

  while (node && remaining > 0) {
    const text = node as Text
    const count = Math.min(remaining, text.data.length)
    text.deleteData(0, count)
    remaining -= count
    node = walker.nextNode()
  }
}

function isEmptyBlock(element: HTMLElement) {
  return ["P", "DIV"].includes(element.tagName) && !(element.textContent || "").trim()
}

function isWhitespaceText(node: Node) {
  return node.nodeType === Node.TEXT_NODE && !(node.textContent || "").trim()
}

function normalizeHref(value: string) {
  const trimmed = value.trim()
  return /^(https?:|mailto:|tel:|#|\/)/i.test(trimmed) ? trimmed : ""
}
