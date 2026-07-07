# @windows-agent-es/web

Phase 1 UI: the combined 4-pane chat window (Claude #1/#2/#3 + Gemini),
each pane with its own model switcher and independent thread, talking to
`apps/server` over SSE.

## Run it

```
npm install
npm run dev
```

Then, with the server running (see `apps/server/README.md`):
1. Copy the install token the server printed on startup into the "Install
   token" field and click Save.
2. Paste your Anthropic and/or Google API key into the settings bar — these
   are sent once to the server and stored in its encrypted vault, never
   kept in the browser beyond the single POST.
3. Chat in any pane. Highlighting text currently just previews what a
   "Save to Notes" action would capture (Phase 2 wires it to `/api/notes`).

## Next

Model switcher currently locks after the first message (thread is already
bound to a model) — Phase 2 will let you fork a thread instead. The
`@mention` injection picker (files/notes/library) isn't in the UI yet;
the server route already accepts an `injections` array.
