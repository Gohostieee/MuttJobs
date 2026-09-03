---
name: resume-summary
description: Create or improve a concise professional summary using only verified resume evidence and optional target-role context. Use when a user wants a focused senior-engineering narrative without changing any field outside the summary.
---

# Universal Resume Guide

MuttJobs injects the repository's complete `resume-guide.md` into every resume AI request. Treat that document as the single authoritative standard for resume writing, tailoring, matching, and auditing. Do not load, infer, or apply another resume-writing guide.

## Capability boundary

Apply the universal guide's optional-summary rule and 40-word limit. Edit only summary.content and preserve every other JSON path and factual claim.

The user's request and MuttJobs' machine-enforced file, selection, and sandbox boundaries remain authoritative for the operation's scope.
