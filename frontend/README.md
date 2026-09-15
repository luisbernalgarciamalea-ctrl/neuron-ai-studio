# Athena AI frontend

An update to the existing Neuron website: Athena AI branding, the supplied logo, Midnight & Gold colors, consistent Lucide tool icons, responsive navigation, readable Markdown, file attachments, and compact code cards with a resizable preview beside the conversation.

## Run and deploy

This is a static website; no build step is required. Serve this folder with any local HTTP server, for example `python -m http.server 4173`, and open http://localhost:4173. Opening the HTML directly as a file is not supported for API requests.

Deploy the contents to the existing frontend repository and Vercel project. Both `index.html` and `neuron.html` are kept identical. Keep `athena.js`, `athena.css`, `assets`, and `vendor` alongside them. Deploy the updated backend first.

The default backend remains https://neuron-backend-v2.vercel.app. An alternate host may be assigned to `window.NEURON_BACKEND_URL` before the main inline script. API credentials belong only in backend environment variables.

The original domain, sitemap, robots.txt, Google verification file, MongoDB integration, and browser storage names remain unchanged. Existing Google indexing is preserved at the same URLs; updated search snippets depend on Google's recrawl. Existing accounts and saved conversations retain their original storage format. This update does not migrate authentication or introduce payments.

## What works differently

- Code replies appear as compact file cards. HTML, CSS, and JavaScript can run in a sandboxed side preview, with Code/Preview, Copy, Download, full screen, and adjustable width. Mobile users switch between conversation and preview. Python, backend code, and projects requiring installed packages can be read and downloaded; they do not execute in the HTML preview.
- Chat providers include Gemini, Groq, and OpenRouter free routing. Auto selects a configured provider; binary attachments require Gemini. A provider selection is not proof of a valid key or available quota.
- Failed requests retain the prompt, and chat and media requests can be stopped. Stopping disconnects the browser; it does not guarantee cancellation of processing already started at a provider.
- Saved code conversations restore their file cards and preview. Book chapter retries no longer save errors as prose, and continuations include recent chapter context.
- Image responses must contain decodable image data. There is no Pollinations or placeholder fallback. Free image access must be verified and enabled on the backend before this feature works.
- Motion video is unavailable until a verified free motion provider is integrated. The separate Storyboard choice produces text only; it is never represented as a generated video.

## Upload limits

Chat-based tools accept up to **5 files totaling 3 MiB per message**, with at most **80,000 extracted characters per file**. A file may be rejected after extraction even if its compressed size is small. The image tool also accepts PNG, JPG, or WebP references.

| Format | Handling |
| --- | --- |
| TXT, Markdown, CSV/TSV, JSON, common code files, EML, SVG | Read as source text; no code is executed |
| DOCX, PPTX, XLSX, ODT/ODS/ODP, EPUB, ZIP | Extract supported text in the browser; layout, embedded images, macros, and formulas are not rendered or executed |
| PDF, PNG/JPG/WebP/HEIC, common audio and video files | Sent to Gemini as binary data; model support and quota still apply |
| Legacy DOC/XLS/PPT, executables, unsupported or encrypted archives | Export to a supported format first |

Archives are limited to 300 entries, 4 MiB per entry, and 8 MiB expanded total. ZIP extracts a selection of common text/code extensions. Spreadsheet extraction uses stored cell values, not a calculation engine. Large media should be trimmed before upload. Attachments are held in memory and sent with the request; they are not permanently stored as uploaded files. Provider processing still occurs when you send them.

## Verification

`tests/browser.cjs` uses Playwright with a local HTTP server. All external API requests are simulated, so the checks do not consume AI credits or test production credentials.

Install Playwright in a development environment, then run `node tests/browser.cjs`. Optional environment variables:

- `PLAYWRIGHT_MODULE`: absolute path to an existing Playwright installation.
- `CHROME_PATH`: absolute path to an installed Chrome browser; otherwise Playwright uses its Chromium installation.
- `ATHENA_SCREENSHOTS`: an existing output directory for desktop, mobile, and home screenshots.

The suite covers signup UI with simulated authentication, tool navigation, five real archive structures, upload limits, provider selection, prompt history, preview interaction and isolation, code tabs and downloads, restored chats, sanitized Markdown, DOCX export, cancellation, failed search/image/video requests, storyboards, mobile navigation, and chapter retry/context behavior. Live MongoDB login, provider credentials, image generation, and motion generation were not validated against production.

Third-party notices are in `THIRD_PARTY_NOTICES.md`.
