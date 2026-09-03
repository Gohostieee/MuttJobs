---
name: consistency-check
description: Diagnose tense, punctuation, date, capitalization, technology naming, duplication, abbreviation, and formatting inconsistencies across a resume. Use for a read-only consistency report, or to apply only high-confidence mechanical fixes when the user explicitly asks to apply or fix them.
---

# Universal Resume Guide

MuttJobs injects the repository's complete `resume-guide.md` into every resume AI request. Treat that document as the single authoritative standard for resume writing, tailoring, matching, and auditing. Do not load, infer, or apply another resume-writing guide.

## Capability boundary

Audit consistency against the universal guide. Default to read-only analysis; make only explicitly requested, high-confidence mechanical fixes within the requested scope.

The user's request and MuttJobs' machine-enforced file, selection, and sandbox boundaries remain authoritative for the operation's scope.
