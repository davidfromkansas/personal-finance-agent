# Abacus CLI — UX Improvement Plan

## Current State (as of 2026-03-31)
The core UX improvements are shipped. The CLI now has:
- Branded ABACUS banner with animated abacus (13 spindles, 7 bead rows) on launch
- Full ANSI color scheme (cyan, bold, dim, red)
- Loading spinner with real-time agent activity display during queries
- Per-agent progress: shows tool calls live while working, then summarises data sources used
- `help` command with example queries
- Account status on launch (count + last synced)
- First-run welcome message after `abacus login`
- `clear` command that redraws the banner + account status

---

## Completed

### 1. Loading Spinner ✅
Spinner runs via `setInterval` + ANSI cursor tricks. Clears on response.
Also shows real-time agent activity (`↳ fetching transactions`, etc.) while working.

### 2. ASCII Banner ✅
Block-letter `ABACUS` (5 rows × 35 chars) rendered side-by-side with an animated abacus frame.
- Abacus: 13 spindles, 7 bead rows (2 top / 5 bottom), separated by a horizontal divider
- Even columns animate upward each tick; odd columns animate downward
- Text is vertically centered alongside the abacus picture
- Animation runs only while the terminal is idle (paused during queries)

### 3. Colored Output ✅
- Prompt `>` — dim white
- User input — white
- Assistant response — default
- Tool/status messages — dim
- Agent labels — cyan bold
- Errors — red
- Banner — bold cyan

### 4. `help` Command ✅
Shows example queries and available commands.

### 5. Account Status on Launch ✅
Shows connected account count + last synced time after banner. Non-blocking.

### 6. First-Run Welcome ✅
Shown after `abacus login`. Suggests starter questions.

### 7. Data Source Transparency ✅
After each answer, the CLI prints which data sources were called per agent:
```
● Spending ("How much did I spend on Uber in January...")
│  ↳ spending summary
│  ↳ transactions
└ Called 2 data sources in 3.4s
```
Previously only showed count; now shows named sources.

---

## Implementation Order (original, all done)
1. ~~Spinner~~ ✅
2. ~~Colors helper~~ ✅
3. ~~ASCII banner + tagline~~ ✅
4. ~~`help` command~~ ✅
5. ~~Account status on launch~~ ✅
6. ~~First-run welcome~~ ✅
7. ~~Data source transparency~~ ✅

---

## Potential Next Improvements
- **Conversation context indicator** — show how many turns are in the active history (e.g. `[5 turns]` in the prompt)
- **`clear` resets history** — currently `clear` redraws the banner but keeps history; could offer `clear --reset` to start fresh
- **Inline chart previews** — render sparklines or ASCII charts in the terminal for simple numeric series
- **Stream answer tokens** — the MCP layer currently returns the full answer at once; streaming would make long answers feel faster

---

## Non-Goals
- No new npm dependencies — everything via Node built-ins + ANSI codes
- No interactive menus or arrow-key navigation (overkill for now)
- No persistent command history across sessions (readline handles in-session history)
