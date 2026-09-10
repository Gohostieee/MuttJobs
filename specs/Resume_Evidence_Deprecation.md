# Resume and evidence workflow retirement

AI resume creation, AI resume editing, profile-to-job evidence matching, evidence tagging, and document coverage/proposal review are retired. Their navigation, bulk actions, and desktop command entry points are removed or return a deprecated error before starting a provider.

Job analysis, requirement confirmation/corrections, target creation/splitting, preparation tasks, company research, and application tracking remain. Preparation tasks now use the analyzed target title and interpretation, and users control completion directly without evidence or document prerequisites. Profile import remains available.

Existing resume files, profile data, and workspace history are not deleted. Legacy Rust document/evidence models and internal processing remain for stored-data compatibility; they are not available through the job workspace commands. Summary caches are invalidated for the new task workflow. Old document navigation restores to Requirements, while saved resumes remain available in the manual editor.

Standalone cover-letter tools remain separate from the retired job-document workflow.

## Resume target checks

The manual resume editor has Sections and Targets tabs in its right sidebar. Choose a saved job in the library editor, or open the resume for the job directly. Check resume runs the selected provider/model/reasoning against canonical targets and visible resume passages. Results contain a boolean match and short explanation per target, with verified quotes for positive matches. It never edits the resume, tags Career Profile evidence, or changes preparation task completion.

Results persist per resume path and job. Resume/target changes invalidate ticks. Concurrent edits, missing or fabricated citations, duplicate/incomplete target responses, provider errors and cancellation retain the previous result. A pending run continues across tab changes and uses the shared background progress UI.
