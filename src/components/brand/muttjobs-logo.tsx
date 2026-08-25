import badgeMark from "@/assets/brand/muttjobs-mark.png"
import darkGlyph from "@/assets/brand/muttjobs-glyph-black.png"
import lightGlyph from "@/assets/brand/muttjobs-glyph-white.png"
import { cn } from "@/lib/utils"

type MuttJobsLogoProps = {
  className?: string
  markClassName?: string
  wordmarkClassName?: string
  variant?: "badge" | "glyph"
  tone?: "dark" | "light"
  withWordmark?: boolean
}

export function MuttJobsLogo({
  className,
  markClassName,
  wordmarkClassName,
  variant = "badge",
  tone = "dark",
  withWordmark = false,
}: MuttJobsLogoProps) {
  const source = variant === "badge"
    ? badgeMark
    : tone === "light"
      ? lightGlyph
      : darkGlyph

  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-2", className)}
      aria-label={withWordmark ? "MuttJobs" : undefined}
    >
      <img
        src={source}
        alt={withWordmark ? "" : "MuttJobs"}
        className={cn("size-6 shrink-0 object-contain", markClassName)}
      />
      {withWordmark ? (
        <span className={cn("truncate font-semibold tracking-tight", wordmarkClassName)} aria-hidden="true">
          muttjobs
        </span>
      ) : null}
    </span>
  )
}
