## Problem Statement

MuttJobs needs a beautiful public release website that its creator can confidently share. Visitors should quickly understand what the desktop app does, see its personality and actual interface, and download the right installer without navigating a developer-oriented repository first. A release page alone does not communicate the product well enough.

The requested design takes heavy inspiration from T3 Code and uses the supplied photograph of a dog wearing glasses at a desk as a floating hero image. Next.js and shadcn/ui are explicit requirements.

## Solution

Build an independently deployable Next.js release website in the MuttJobs repository. Create a dark, spacious, polished landing page with expressive typography, a subtle grid, restrained orange brand accents, the floating dog photograph, real product previews, clear explanations, and prominent Windows download actions.

The page should move naturally from the product promise to visual proof, useful capabilities, setup expectations, and downloading. Give visitors enough information to decide whether MuttJobs fits their job search. Ensure every present-tense feature claim matches the release being offered, and label any unreleased preview explicitly.

## User Stories

1. As the creator, I want a polished public website, so that I can proudly share MuttJobs with other people.
2. As a visitor, I want to understand MuttJobs within the first screen, so that I can decide whether to keep reading.
3. As a visitor, I want to know that MuttJobs is a desktop job-search workspace, so that I understand what I am downloading.
4. As the creator, I want heavy visual inspiration from T3 Code, so that the site has the confident presentation I requested.
5. As the creator, I want my exact supplied dog photograph in the hero, so that the website has the intended personality.
6. As a visitor, I want the photograph to float gently, so that the hero feels alive without interrupting reading.
7. As a visitor, I want the image to retain its recognizable subject and composition, so that the visual joke remains clear.
8. As a visitor, I want a prominent download action near the headline, so that I can act immediately.
9. As a visitor, I want authentic product screenshots, so that I can see what using MuttJobs is like.
10. As a job seeker, I want to understand job discovery and saved searches, so that I can evaluate how MuttJobs helps me find opportunities.
11. As a job seeker, I want to understand Applications list and board views, so that I can see how to organize my search.
12. As a job seeker, I want an accurate explanation of Requirements and Preparation tasks where released, so that I understand how the app helps me prepare.
13. As a job seeker, I want to understand the Career Profile and resume library, so that I know how my career information and documents are organized.
14. As a job seeker, I want to see manual resume editing and export capabilities, so that I can judge whether the document tools fit my needs.
15. As a job seeker, I want read-only resume Targets checks described accurately where released, so that I do not mistake checking for automatic rewriting.
16. As a job seeker, I want an explanation of Company Research, so that I can see how the app supports preparation.
17. As a visitor, I want local storage and optional online integrations explained, so that I understand where my information goes.
18. As a visitor, I want to know which functions work without AI, so that I can decide whether additional setup is worthwhile.
19. As a visitor, I want supported AI provider prerequisites explained, so that I can prepare the appropriate local tools and accounts.
20. As a visitor, I want to know that TheirStack search requires my own API key and may consume credits, so that I understand that integration's requirements.
21. As a Windows user, I want a clearly recommended x64 installer, so that I do not have to guess which file to download.
22. As a Windows user, I want an MSI alternative when available, so that I can choose the package suitable for my environment.
23. As a visitor, I want the release version, beta status, and platform displayed together, so that I know exactly what is offered.
24. As a visitor, I want release notes linked beside the download information, so that I can inspect changes and known limitations.
25. As a visitor, I want download links to point to actual published release assets, so that the advertised action works.
26. As a visitor on another platform, I want Windows availability stated plainly, so that I am not promised an unavailable native build.
27. As a visitor, I want concise installation expectations for the unsigned beta, so that an operating-system warning is not an unexplained surprise.
28. As a visitor, I want a usable release-page fallback if an asset is unavailable, so that I have a clear next step.
29. As a visitor, I want current-release capabilities distinguished from upcoming changes, so that screenshots and copy do not misrepresent my download.
30. As a mobile visitor, I want the same visual polish and useful content as desktop, so that the shared link works well on my phone.
31. As a keyboard user, I want to reach navigation, downloads, and FAQ controls, so that I can use the entire site without a pointer.
32. As a screen-reader user, I want semantic headings, descriptive links, and useful image descriptions, so that the content is understandable.
33. As a visitor who requests reduced motion, I want the hero and reveals to become still, so that the page remains comfortable to use.
34. As a visitor on a slow connection, I want text and download links to arrive promptly, so that large visuals do not block my decision.
35. As a visitor, I want clear answers about setup, beta status, platforms, backups, and licensing, so that I can resolve common questions without searching the repository.
36. As someone sharing MuttJobs, I want a meaningful social preview and page title, so that the link looks intentional in messages and social feeds.
37. As a returning visitor, I want a repeated download action near the end of the page, so that I can act after reading.
38. As the maintainer, I want one source of release metadata, so that versions, download targets, and release notes stay consistent throughout the site.
39. As the maintainer, I want the website to build independently of the desktop app, so that routine marketing changes are easy to preview and deploy.
40. As the maintainer, I want browser-based acceptance checks and visual review, so that the published experience matches the spec across devices.

## Implementation Decisions

- **Application boundary:** Add a separate website package within the existing repository using Next.js App Router, TypeScript, Tailwind CSS, and shadcn/ui. Give it independent development, production build, and browser-test commands. The existing desktop application remains Vite/Tauri; the website needs no Rust service, local provider worker, desktop storage, or credentials.
- **UI ownership:** Initialize shadcn for the Next.js package using its supported setup. Compose accessible Button, Accordion, Separator, Badge, and navigation primitives where needed. Use semantic theme tokens and the established MuttJobs mark. Keep visual effects in the marketing layer and avoid importing the desktop shell or its entire stylesheet.
- **Art direction:** Use charcoal/near-black backgrounds, high-contrast warm white type, muted secondary copy, fine borders, a faint grid, and selective MuttJobs orange. Use a carefully chosen display sans with restrained supporting type. Preserve generous spacing and a bounded reading width. Draw heavily from T3's hierarchy, floating visual depth, focused download emphasis, and large product preview while writing original MuttJobs copy.
- **Hero:** Combine a short beta/platform eyebrow, a large product promise, concise supporting copy, one primary Windows download action, and secondary product-tour/release-note navigation. Suggested headline direction: “Your next job starts here.” Treat final copy as editorially adjustable within the verified product claims.
- **Supplied image:** Use the exact user-supplied dog-at-desk photograph as the main floating visual. Preserve the original source and recognizable desk/glasses/dog composition; use responsive display sizing rather than replacing it with generated art. Present it in a subtly tilted photographic frame with depth and a soft shadow. On wide screens it can overlap the hero composition in a reserved visual area; on mobile it flows below the main copy and actions without covering them.
- **Motion:** Use gentle vertical drift of roughly 8–12 pixels over a slow 6–8 second cycle and at most a slight rotational variation. Restrict animation to transform/opacity where practical. Reduced motion disables floating, parallax, animated scrolling, and decorative reveals. Content is readable immediately, including if JavaScript is unavailable. No scroll hijacking or interaction required to reveal the download action.
- **Page sequence:** Compact branded navigation; hero; large real application preview; a short workflow explanation; a few substantial feature sections; local storage and optional integration explanation; download/setup details; FAQ; closing download action and compact footer. Alternate text and product visuals instead of filling the page with repeated generic feature cards.
- **Product vocabulary:** Use Applications, Career Profile, Requirements, Preparation tasks, Company Research, Resumes, Cover Letters, and Targets where they describe verified released behavior. The current source has retired AI resume creation/editing, evidence tagging, and document coverage/proposal workflows. Do not market retired behavior as the product's direction. Manual resume editing, profile import, independent Preparation tasks, and read-only Targets checking are distinct capabilities.
- **Release-to-content contract:** Associate screenshots and claims with the promoted release. The current public beta predates the latest workspace changes. For an immediate launch against that beta, describe verified common capabilities and label newer previews as upcoming. For a launch advertising the current source behavior, require a matching published installer before calling those features available. A version string in the working tree is insufficient evidence of release contents.
- **Product previews:** Capture real application screens using fictional, non-sensitive demo data. Show enough of Applications and document/preparation workflows to explain the app. Label upcoming-version previews. Provide useful alt text and mobile-readable crops or a keyboard-accessible enlarged view. Do not invent functional UI or present mockups as shipped screenshots.
- **Release metadata:** Keep one small typed, maintainer-controlled record containing the promoted version/tag, display date, beta status, supported platform/architecture, release-note URL, and available installer names/URLs. All download surfaces consume it. Update it alongside the content review for each release; avoid silently switching binaries beneath version-specific copy.
- **Download behavior:** Use ordinary HTTPS links to real GitHub Release assets. Prefer the standard Windows x64 EXE, expose MSI as a secondary option when published, and offer release notes/all downloads nearby. Explicitly state Windows availability for all visitors rather than offering guessed platform downloads. No signup, tracking redirect, automatic download, or invented macOS/Linux build.
- **Unavailable releases:** Validate the configured asset set before publication. If there is no verified downloadable asset, replace the direct-download promise with an honest release-page action and availability copy. Preserve a nearby GitHub Releases fallback even when direct links are valid. The static site cannot guarantee recovery from GitHub outages or later asset deletion; the release process must recheck links and update the metadata.
- **Practical setup information:** State that the promoted build is beta software and, while applicable, unsigned. Explain local AI prerequisites and TheirStack's separate API key/credit requirements in compact supporting content. Keep provider-specific availability accurate for the promoted build. Local storage does not imply that optional AI/search/research never send information to external services.
- **Licensing and proof:** Link the public repository using neutral wording. Do not claim open-source licensing, copy T3's MIT claim, invent testimonials, display fabricated adoption numbers, or promise employment outcomes. Confirm pricing/licensing language from project policy before adding it.
- **Responsiveness and accessibility:** Use a single page scroll, bounded content, readable typography, adequate contrast, visible focus, sensible heading hierarchy, descriptive links, and touch targets around 44 pixels. Verify the photo, screenshot frames, and typography at narrow widths and 200% zoom. Keep main information outside collapsed disclosures; use the FAQ for secondary detail.
- **Performance and sharing:** Render the main content statically with minimal client JavaScript. Optimize responsive images with explicit dimensions, prioritize the hero appropriately, and lazy-load lower-page screenshots. Add title, description, favicon, social preview, canonical URL, robots configuration, and sitemap using the eventual public origin. Preview deployments must not declare themselves the production canonical site.
- **Hosting:** Make the website deployable independently to a Next.js-capable host and document its build/root configuration. Supply a working preview and verify the final public URL once the hosting target is configured. Domain registration or paid infrastructure purchases are separate decisions; no domain or host has been selected in this request.

## Testing Decisions

- **Primary seam:** One browser-level acceptance suite against the website's production build. Exercise public pages, accessible controls, rendered content, media behavior, and outbound download destinations. Test observable visitor outcomes rather than internal React state, component trees, utility classes, or implementation-shaped snapshots.
- **Prior art:** Reuse the repository's Playwright conventions, semantic role/label selectors, desktop/mobile viewport checks, page-error collection, and screenshot review practices from the existing Job Workspace and theme tests. Give the website a separate server/test configuration; its tests do not need the desktop Rust fixture server or Tauri bridge.
- **Core journey:** Load the landing page; identify MuttJobs and Windows beta availability; inspect the product explanation; navigate to download details; activate the recommended installer action; verify its destination and the MSI/release-note alternatives. Check that every repeated CTA describes the same release.
- **Download verification:** In routine browser tests, intercept the known external download navigation to assert the exact configured destination without downloading installers repeatedly. Before publication, independently verify that each real anonymous HTTPS destination resolves to the expected GitHub asset and that release notes are reachable. This verifies distribution links, not successful installation or desktop runtime behavior.
- **Release variants:** Exercise a populated release record, missing optional MSI, and no verified installer through the rendered page. Require an honest release-page fallback and no dead or fabricated download action in the unavailable state. Keep fixture selection in test/build configuration, outside the public user interface.
- **Responsive acceptance:** Inspect at least 1440px desktop, 768px tablet, and 390px mobile; add a 320px narrow-layout check. Assert that the headline, hero photograph, key content, and CTA remain visible without horizontal page overflow or clipped controls. Review 200% zoom and the mobile navigation if one is needed.
- **Accessibility and motion:** Test keyboard navigation and FAQ operation, visible focus, semantic names, useful image alternatives, and reduced-motion behavior. Observe the actual floating animation with normal motion and its static composition with reduced motion. Verify that text and essential download links remain usable without JavaScript.
- **Visual review:** Inspect the real rendered website on desktop and mobile, including image fidelity, crop, typography, spacing, shadows, grid intensity, screenshot legibility, and motion. Iterate until the design meets the requested polish. Passing a build or producing screenshots alone is not visual acceptance.
- **Release/content review:** Audit copy and screenshots against the promoted installer. Specifically check that current-source Preparation tasks/Targets behavior is not implied to exist in an older installer and that retired AI document workflows are not promoted as forthcoming features.
- **Production checks:** Run the website's type checks and production build, inspect page errors and broken images, check metadata/social preview URLs, and review loading/layout stability. Repeat a concise smoke check on the deployed URL. Existing desktop suites are necessary only if implementation changes shared desktop code or build configuration.
- **Seam consultation:** The proposed browser boundary was presented to the requester during specification. Installer installation testing is a separate scope extension unless requested. Record any requested adjustment before implementation.

## Out of Scope

- Rewriting the desktop app in Next.js or exposing private desktop data through a web application.
- Restoring deprecated resume generation, AI resume editing, evidence tagging, or document proposal/coverage flows.
- Creating or signing new installers, adding an updater, or certifying installation behavior as part of website testing.
- Promising additional operating systems without published, verified builds.
- Accounts, payments, subscriptions, email capture, a CMS, analytics, or a live in-browser product backend.
- Fabricated testimonials, usage statistics, pricing promises, or licensing changes.
- Purchasing a domain or a hosting plan without a separately selected destination and budget.

## Further Notes

- Requested design reference: [T3 Code](https://t3.codes/), inspected on 2026-09-10. Observed qualities include a dark grid-backed hero, oversized central typography, floating visual elements, concentrated download actions, and a large application preview. These inform composition, not MuttJobs feature claims.
- Framework references: [Next.js App Router](https://nextjs.org/docs/app/getting-started) and [shadcn/ui Next.js setup](https://ui.shadcn.com/docs/installation/next).
- Verified repository and issue tracker: [Gohostieee/MuttJobs](https://github.com/Gohostieee/MuttJobs). Apply the existing `ready-for-agent` label to this specification issue.
- Verified published release on 2026-09-10: [MuttJobs v0.2.0 Beta 1](https://github.com/Gohostieee/MuttJobs/releases/tag/v0.2.0-beta.1), published 2026-08-25, with Windows x64 EXE and MSI assets. Its displayed name says Beta even though GitHub's prerelease flag is false; derive user-facing beta wording from the reviewed release record rather than that flag alone.
- Existing published release links: [Windows EXE](https://github.com/Gohostieee/MuttJobs/releases/download/v0.2.0-beta.1/MuttJobs_0.2.0-1_x64-setup.exe) and [Windows MSI](https://github.com/Gohostieee/MuttJobs/releases/download/v0.2.0-beta.1/MuttJobs_0.2.0-1_x64_en-US.msi). API asset existence was verified during specification; anonymous download verification remains an implementation acceptance check.
- The existing README includes older workspace behavior and is not sufficient as the website's sole content source. The current workflow-retirement specification and current application UI supersede it for product direction; the actual promoted release controls available-now claims.
- The user supplied `image.png`, a 1150 by 900 photograph of a dog wearing glasses at an office desk. A byte-for-byte companion copy is included at `specs/assets/muttjobs-release-hero.png` for implementation handoff alongside this specification.
- This deliverable is the implementation specification requested through `to-spec`; the website itself will be implemented from this issue.
