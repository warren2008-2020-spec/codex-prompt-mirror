# Prompt Mirror

Prompt Mirror is a local-first reflection layer for people who work with Codex a lot.

It does not try to replace Codex, manage your projects, or review your code.
It helps you review something else:

- which conversations are still worth continuing
- which conversations are getting scattered
- when you are adding clarity
- when you are only adding more scope

## Why this exists

Heavy Codex users already know the pattern:

- too many conversations open at once
- long chats that feel productive but stop moving
- repeated re-explaining of the same thing
- not knowing whether the problem is Codex or the way the task was described

Prompt Mirror is built for that layer.
It is not about doing more with AI.
It is about understanding how you are working with AI.

## What this project is

This repo currently contains:

- a local prototype that can read Codex session JSONL files on the same machine
- several public-facing demo pages for testing product direction
- a first-pass parser and local dashboard server

## What this project is not

Prompt Mirror is not:

- a Codex UI modification
- a browser extension that patches Codex screens
- another code review tool
- a cloud sync product
- a psychological diagnosis tool

## Current demos

These demo pages are mockups for product direction, not claims of finished behavior:

- `demo-d.html`
  Beginner-friendly reflection page
- `demo-e.html`
  Safety and control-range page

These pages are intentionally simpler than the live parser view. They show the intended public product language, not just the internal data structure.

## Privacy and safety direction

The intended default behavior is conservative:

- local only
- read only
- recent sessions only
- summary view by default
- evidence shown as summary, not raw quotes
- user chooses what ranges or conversations are included

The current prototype is not yet the final privacy model. Public release should assume that raw prompts, paths, and full session text are sensitive.

## Local prototype

The current local prototype can read:

- `C:\Users\Administrator\.codex\sessions`
- `C:\Users\Administrator\.codex\archived_sessions`

Run locally:

```powershell
cd prompt-mirror-demo
node server.js
```

Open:

- `http://127.0.0.1:4318/`

## Tests

```powershell
node --test parser.test.js
```

## Release standard

This project should only be published as a serious public release when it satisfies all of the following:

- readable by non-technical users
- every suggestion has a reason
- every reason can lead to a next action
- default view is privacy-safe
- product language does not depend on Codex-internal jargon
- value is clearly different from Codex's built-in chat management and code review surfaces
