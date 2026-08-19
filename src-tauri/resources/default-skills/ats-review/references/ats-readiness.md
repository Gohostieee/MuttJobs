# ATS readiness checks

Inspect these MuttJobs fields when present:

- `metadata.layout.pages[*].fullWidth`, `main`, and `sidebar` for multi-column or sidebar-heavy layouts.
- `picture.hidden`, icon visibility, and section icons for nonessential graphics.
- `metadata.typography.*.fontSize` for readable sizing.
- Section titles and enabled/hidden state for conventional discoverability.
- Contact fields for normal-flow availability.

Use cautious findings:

- Multi-column layouts, sidebars, pictures, icons, tables, text boxes, and header/footer contact data can introduce parsing risk.
- Prefer recognizable headings such as Experience, Education, Skills, and Projects.
- Important abbreviations can be paired with their standard names when evidence supports the term.
- Follow an employer's requested file type. Do not claim PDF or DOCX is universally superior.
- Meaningful, truthful target terminology is useful; keyword stuffing and unsupported terms are not.

Keep layout findings independent from content-match findings. Changing a two-column layout to a single flow may improve parseability without changing qualification evidence.
