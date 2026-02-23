# Walkable Resume

A top-down 2D interactive resume built with **Phaser 3** (no build step required).

Walk around the PCB map, approach module stations, and read resume sections in the
anchored callout and the docked **Module Readout** sidebar.

---

## Controls

| Key / Action | Effect |
|---|---|
| `WASD` / Arrow keys | Move the probe |
| Approach a module | Callout + sidebar open automatically |
| `Esc` / Callout × button | Dismiss anchored callout |
| **◀ / ▶** sidebar button | Collapse / expand sidebar |
| Click a section in the Index | Load that section in the sidebar |

---

## UI Layout

```
┌─────────────────────────────────────────┐  ┌─────────────────┐
│  PCB Game Canvas                        │  │  MODULE READOUT │
│                                         │  │  ─────────────  │
│   [callout chip]──────────[station]     │  │  Section title  │
│                                         │  │  • bullet …     │
│                                         │  │  • bullet …     │
│                                         │  │                 │
│                                         │  │  SECTION INDEX  │
│                                         │  │  > Summary SW   │
└─────────────────────────────────────────┘  │  > Summary Sec  │
                                             └─────────────────┘
```

On screens ≤ 700 px wide the sidebar becomes a **bottom drawer** that slides up
when the ▲ button is tapped.

---

## Editing the Resume

Open **`/resume/content/resume.json`** in any text editor. Schema:

```json
{
  "sections": [
    {
      "id": "my-section",
      "title": "Section Title",
      "bullets": [
        "First bullet.",
        "Second bullet."
      ],
      "link": {
        "label": "Button label (optional)",
        "url": "https://example.com"
      }
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | Must match a station `id` in `game.js` `STATIONS` array |
| `title` | Yes | Displayed in both callout and sidebar |
| `bullets` | Yes | Callout shows first 2; sidebar shows all |
| `link` | No | Omit entirely if not needed |

---

## Station-to-Section Mapping

Stations in `game.js` and sections in `resume.json` are linked by **matching `id` strings**.

Current station IDs (defined in `STATIONS` array in `game.js`):

| Station ID | Label | World position |
|---|---|---|
| `summary-software` | CORE.SW | x=360, y=150 |
| `summary-security` | CORE.SEC | x=840, y=150 |
| `core-skills-software` | STACK.SW | x=140, y=300 |
| `core-skills-security` | STACK.SEC | x=1060, y=300 |
| `experience-humana` | EXP.HUMANA | x=200, y=440 |
| `experience-paladin` | EXP.PALADIN | x=600, y=340 |
| `experience-ng-2023` | EXP.NG-23 | x=1000, y=440 |
| `experience-ng-ia-2020` | EXP.NG-IA | x=600, y=540 |
| `experience-utah-dcfs` | EXP.DCFS | x=200, y=600 |
| `experience-earlier` | EXP.PRIOR | x=1000, y=600 |
| `education-certs` | CREDENTIALS | x=380, y=760 |
| `links` | I/O PORTS | x=820, y=760 |

Sections in `resume.json` that have no matching station still appear in the
**Section Index** in the sidebar but have no station on the map.

---

## Adding a New Station + Section

1. Add the section to `resume.json` with a unique `id`.
2. Add a station entry to `STATIONS` in `game.js`:
   ```js
   { id: 'your-id', x: 600, y: 300, color: 0xABCDEF, label: 'SHORT.TAG' },
   ```
   Choose `x`/`y` coordinates that sit on a primary trace intersection
   (horizontal traces at y = 150, 300, 440, 600, 760; vertical at x = 140, 360, 600, 840, 1060).
3. Save both files — no build step, just reload the page.

---

## Callout Tuning Constants

All in `game.js` near the top:

| Constant | Default | Effect |
|---|---|---|
| `INTERACT_R` | `88` px | Proximity radius that triggers callout open |
| `SIGNAL_LOST_R` | `180` px | Distance at which callout shows "⚠ SIGNAL LOST" and fades |
| `CALLOUT_OFFSET` | `36` px | Gap between station screen position and callout edge |
| `CALLOUT_BULLET_PREVIEW` | `2` | Number of bullets shown in callout (all bullets in sidebar) |
| `CALLOUT_VIEWPORT_PAD` | `12` px | Minimum distance callout stays from viewport edges |

---

## Deploying on Cloudflare Pages

1. Push this repository to GitHub (or any Git provider Cloudflare supports).
2. In the [Cloudflare Dashboard](https://dash.cloudflare.com), open
   **Pages → Create a project → Connect to Git**.
3. Select your repository:

   | Setting | Value |
   |---|---|
   | Build command | *(leave blank — static files, no build)* |
   | Build output directory | `/` (repository root) |

4. Click **Save and Deploy**.

`/resume/` resolves to `/resume/index.html` automatically.

---

## Intentionally unlinked homepage

The main homepage (`/index.html`) **does not link to this page**.
The walkable resume is reachable only by direct URL:

```
https://yourdomain.com/resume/
```

---

## File structure

```
/resume/
  index.html        — Two-column layout shell + callout element
  resume.css        — PCB dark theme, sidebar, callout, responsive
  game.js           — Phaser scene + callout placement + leader line + sidebar logic
  content/
    resume.json     — ALL resume content lives here (edit this)
  README.md         — This file
```

---

## Local development

Because the game fetches `resume.json` via `fetch()`, you need a local HTTP server.

```bash
# Python 3
python -m http.server 8080
# then open http://localhost:8080/resume/

# Node (npx)
npx serve .
# then open the URL shown, append /resume/
```
