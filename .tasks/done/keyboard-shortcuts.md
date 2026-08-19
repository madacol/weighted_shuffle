# Keyboard shortcuts and list navigation

## Request

Add more keyboard shortcuts. The user also reported that the Library and Queue navigation shortcuts do not work.

## Scope and decisions

- Owner layer: the browser UI in `index.js`, `components/Library.js`, `components/Playlist.js`, and the keyboard-shortcuts dialog in `index.html`.
- List key handling now lives at each component's shadow root rather than on individual, frequently re-rendered rows. This gives each component one dependable keyboard event path.
- `↑`, `↓`, `Home`, and `End` navigate rows; moved rows are scrolled into view. Library navigation excludes filter-hidden songs.
- Added global shortcuts: `U`/`+` upvotes, `D`/`-` downvotes, `F` or `/` focuses the Library filter, `Q` focuses the current Queue song, and `G`/`Shift+G` focus the first/last Library song.
- Global shortcuts remain disabled while typing in inputs, textareas, selects, or contenteditable elements.

## Acceptance criteria and outcome

- Library and Queue rows respond to `Enter`, `↑`, `↓`, `Home`, and `End` when a row has focus; `G`, `Shift+G`, and `Q` provide direct keyboard entry points. Completed.
- Library navigation skips filtered-out songs and focused rows remain visible. Completed.
- The added global shortcuts are implemented and documented in the help dialog. Completed.
- JavaScript typechecking and the existing test suite pass. The suite passes. The repository's `tsc -p jsconfig.json --noEmit` command could not run because `tsc` is not installed in this workspace; Bun browser bundling succeeded as a syntax/module check.

## Verification

- `bun build index.js --target=browser --outfile=/tmp/weighted-shuffle-shortcuts-browser-check.js` — passed; bundled 11 modules.
- `bun test` — passed; 14 tests and 43 expectations.
- `git diff --check` — passed.
