---
name: decode-job
description: Decode the complete saved posting into grounded hiring targets. Requires a saved job context and the Job Workspace analysis contract.
---

Invoke the job-scoped Analyze operation. Never use a resume-editing contract.
If no saved job is selected, ask the user to open a saved job. Do not edit a resume.
Follow instructions.txt and the structured output schema supplied by the application.
