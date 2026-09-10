# MuttJobs theme and layout audit

Updated: 2026-09-09. Scope: all of `src`, the seven current workspaces, shared shadcn components, AI Elements/assistant-ui integrations, and all four stylesheets. The navigation cleanup removed the former Overview, Interviews, and Contacts placeholders.

## Result

Big Env is the only application theme. Application colors come from its shadcn semantic tokens; document content keeps its own user-selected paper, ink, and typography. The outstanding component and layout consolidation from the initial audit has been implemented.

The original inconsistency had two causes: feature CSS overrode shadcn controls, and several workspaces built their own controls and library surfaces. Feature CSS now lives in the `components` layer, below utility classes. Every stylesheet establishes the same layer order so import order cannot put Tailwind's reset above feature layout.

## Completed consolidation

| Area | Change |
| --- | --- |
| Theme | Kept Big Env's dark background, warm foreground, mono typography, and square corners. Central input borders are quieter (`#4b4945`), ordinary borders are `#343330`, and destructive text is a clearer `#ed7770`. Card, popover, accent, success, and warning colors are centralized alongside the standard shadcn tokens. |
| Libraries | Resumes and Cover Letters use shared WorkspaceHeader, Card, Empty, Skeleton, Alert, and InputGroup components. Search, folder actions, document opening, and existing editor behavior are preserved. |
| Applications | Shared header and content spacing; shadcn Checkbox, ToggleGroup, Button, Empty, Alert, and Skeleton replace bespoke controls and states. Bulk actions use semantic card styling. List/board data and preparation behavior remain shared. |
| Requirements | Repeated controls use the shared FormField composition of Field/FieldLabel/FieldDescription with unique IDs and descriptions. Navigation uses Button variants, confirmation uses Progress, and supporting criteria use Collapsible and FieldSet. The Progress primitive now forwards its value for assistive technology. |
| Job Search | Token inputs use InputGroup while preserving Enter/comma, paste, blur, and Backspace behavior. Countries use keyboard-selectable Command results. Selects have associated labels, and range groups use fieldsets/legends. Ordinary interactive filter controls use Button. The detail dialog uses standard centered DialogContent sizing instead of forced `!important` offsets beside the sidebar. |
| Model/composer | Model, job, and resume search fields use InputGroup. Removed redundant control paint, focus, font, and direct input-group overrides, leaving shared primitives responsible for their visual states. Retained model-list keyboard handling, provider filters, favorites, and responsive popup geometry. |
| Document inspector | Typography groups use FieldSet/FieldGroup. Letter fields use associated labels, and the inspector initially opens Paragraphs instead of expanding every group. Removed redundant inspector field/control styling. Skill actions use compact Button variants and semantic Badge states. |
| Page hierarchy | Shared compact headings and responsive padding for Applications, Job Search, Resumes, and Cover Letters. Profile uses a quieter standard Card header, consistent heading size and padding, and flex/gap groups. Settings retains its existing shared components and single mobile header. |
| CSS ownership | Extracted document rendering, templates, pagination, print, and export rules to `src/styles/documents.css`. Removed obsolete library, progress, inspector, dialog, and control rules in addition to the initial audit cleanup. |
| Shell | One viewport owner, workspace-owned scrolling, and one mobile sidebar trigger. Settings remains valid when restoring the saved tab. Retired theme preferences cannot change the active theme. |

The [generated source inventory](Theme_Source_Inventory.md) covers every TSX file, including dormant registry widgets. Run `npm run audit:theme` to regenerate it. It fails on literal Tailwind palette utilities and inventories native controls, inline styles, and custom CSS hooks for review.

## Custom CSS retained deliberately

- Document output: paper dimensions, pagination, columns, template typography, document-data colors, print rules, and offscreen export roots. These are independent of the app palette.
- Runtime geometry: zoom, drag/drop, selection positions, resizing, page breaks, and editor viewport containment.
- Specialized structures: section trees, preparation board columns, target rows, Markdown/rich text, and integration layout. Their colors reference semantic tokens; standard controls use shared primitives.
- Native disclosures remain where ordinary document/diagnostic disclosure behavior is sufficient. Native file/color inputs and document editing surfaces are intentional.
- Brand assets, syntax highlighting, neutral shadows, and user-selected document/icon colors are not application palette violations.

This does not replace specialized editor layout with generic cards or implement new product workflows. It removes the competing styling layer around ordinary application controls and surfaces.

## Verification

- Theme inventory: 203 source files, 152 TSX files, four stylesheets; zero literal Tailwind palette utility violations.
- TypeScript and production bundling pass; the existing large-chunk warning remains.
- All 10 Job Workspace browser tests pass: navigation, analysis, requirement editing/confirmation, inspector focus return, list/board consistency, saved tasks, resume target checks, stale-check invalidation, narrow sidebar, and job-specific resume editing.
- Four theme browser tests pass: all seven current workspace headings/layouts at 1440px and 390px; no outer-page overflow; one mobile sidebar trigger; ignored legacy theme preferences; live token inheritance; country/token keyboard editing; document colors independent of app tokens; and cover-letter paper-size/label behavior.
- Model-picker checks pass at 900px and 390px: popup layout, search, model selection, and reasoning selection.
- Browser screenshots were inspected for desktop/mobile libraries, Profile, Applications, and the affected editor flows. Tests use preview data and a Rust fixture service. Live provider credentials, native desktop integration, and an actual production PDF export are not certified by these checks.

References: [shadcn theming](https://ui.shadcn.com/docs/theming), [Field](https://ui.shadcn.com/docs/components/radix/field), [Input Group](https://ui.shadcn.com/docs/components/radix/input-group), [Command](https://ui.shadcn.com/docs/components/radix/command).
