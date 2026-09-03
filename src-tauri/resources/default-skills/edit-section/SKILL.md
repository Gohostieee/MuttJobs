---
name: edit-section
description: Edit exactly one named resume section while preserving every other subtree and protected historical fact. Use when a user requests a scoped revision to Experience, Projects, Skills, Summary, or another unambiguously identified section.
---

# Universal Resume Guide

MuttJobs injects the repository's complete `resume-guide.md` into every resume AI request. Treat that document as the single authoritative standard for resume writing, tailoring, matching, and auditing. Do not load, infer, or apply another resume-writing guide.

## Capability boundary

Apply the universal guide only inside the section named by the request. Preserve every unrelated JSON path, identity field, fact, ID, rich-text structure, and presentation setting.

The user's request and MuttJobs' machine-enforced file, selection, and sandbox boundaries remain authoritative for the operation's scope.
