# MuttJobs brand assets

Use `MuttJobsLogo` from `@/components/brand/muttjobs-logo` in application UI so sizing, accessible text, and mark selection stay consistent.

- `muttjobs-mark.png`: canonical orange badge on transparency, 1024px.
- `muttjobs-mark-reverse.png`: orange badge with a white glyph for dark or photographic surfaces.
- `muttjobs-glyph-black.png`: one-color glyph for light surfaces.
- `muttjobs-glyph-white.png`: one-color glyph for dark surfaces.
- `muttjobs-mark-{16,32,64,128,256}.png`: pre-sized UI assets.

Canonical colors:

- MuttJobs orange: `#ff4c0a`
- MuttJobs charcoal: `#121619`

The Tauri desktop icon source is `src-tauri/icons/muttjobs-app-icon.png`. Regenerate platform assets with:

```powershell
npm run tauri -- icon src-tauri/icons/muttjobs-app-icon.png --output src-tauri/icons
```
