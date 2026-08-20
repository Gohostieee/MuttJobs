import type { FontWeight } from "@/lib/resume-types"

export type GoogleFont = {
  family: string
  category: "Sans serif" | "Serif"
  description: string
}

type GoogleFontLoadRequest = string | {
  family: string
  weights?: FontWeight[]
}

// Keep the picker intentionally curated so it stays useful in a narrow sidebar
// while still covering clean sans, editorial serif, and hybrid resume styles.
export const GOOGLE_FONTS: GoogleFont[] = [
  { family: "Inter", category: "Sans serif", description: "Neutral and highly readable" },
  { family: "DM Sans", category: "Sans serif", description: "Soft geometric sans" },
  { family: "Manrope", category: "Sans serif", description: "Modern, open proportions" },
  { family: "Plus Jakarta Sans", category: "Sans serif", description: "Polished and contemporary" },
  { family: "IBM Plex Sans", category: "Sans serif", description: "Technical with warmth" },
  { family: "Source Sans 3", category: "Sans serif", description: "Calm editorial sans" },
  { family: "Space Grotesk", category: "Sans serif", description: "Distinctive display rhythm" },
  { family: "Roboto", category: "Sans serif", description: "Familiar and versatile" },
  { family: "IBM Plex Serif", category: "Serif", description: "Structured editorial serif" },
  { family: "Lora", category: "Serif", description: "Humanist and approachable" },
  { family: "Merriweather", category: "Serif", description: "Comfortable long-form serif" },
  { family: "Libre Baskerville", category: "Serif", description: "Classic print-inspired serif" },
  { family: "Roboto Slab", category: "Serif", description: "Confident slab serif" },
  { family: "Playfair Display", category: "Serif", description: "High-contrast editorial display" },
]

const DEFAULT_FONT_WEIGHTS: FontWeight[] = ["400", "500", "600", "700"]
const loadedFontWeights = new Map<string, Set<FontWeight>>()

export function findGoogleFont(family: string) {
  return GOOGLE_FONTS.find((font) => font.family === family)
}

export function loadGoogleFont(family: string, weights: FontWeight[] = DEFAULT_FONT_WEIGHTS) {
  if (typeof document === "undefined" || !family) return

  const font = findGoogleFont(family)
  if (!font) return

  const nextWeights = new Set(weights.length ? weights : DEFAULT_FONT_WEIGHTS)
  const previousWeights = loadedFontWeights.get(family) ?? new Set<FontWeight>()
  const mergedWeights = new Set([...previousWeights, ...nextWeights])
  if (mergedWeights.size === previousWeights.size) return

  const id = `google-font-${font.family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
  const link = document.getElementById(id) as HTMLLinkElement | null
  const stylesheet = link ?? document.createElement("link")
  stylesheet.id = id
  stylesheet.rel = "stylesheet"
  stylesheet.href = `https://fonts.googleapis.com/css2?family=${font.family.replace(/ /g, "+")}:wght@${Array.from(mergedWeights).sort().join(";")}&display=swap`
  if (!link) document.head.appendChild(stylesheet)
  loadedFontWeights.set(family, mergedWeights)
}

export function loadGoogleFonts(fonts: GoogleFontLoadRequest[]) {
  const requests = new Map<string, Set<FontWeight>>()
  for (const request of fonts) {
    const family = typeof request === "string" ? request : request.family
    if (!family) continue
    const weights = typeof request === "string" ? DEFAULT_FONT_WEIGHTS : request.weights?.length ? request.weights : DEFAULT_FONT_WEIGHTS
    const current = requests.get(family) ?? new Set<FontWeight>()
    weights.forEach((weight) => current.add(weight))
    requests.set(family, current)
  }

  requests.forEach((weights, family) => loadGoogleFont(family, Array.from(weights)))
}
