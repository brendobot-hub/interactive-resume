/**
 * game.js — PCB Lab Resume
 * ─────────────────────────
 * Dark circuit-board environment. A probe navigates between PCB module
 * stations representing resume sections.
 *
 * Content lives in ./content/resume.json — edit that file to update text.
 *
 * Controls
 *   Move:  WASD or Arrow keys
 *   Close callout: Esc or X button
 *
 * UI architecture
 *   ┌─ #game-area ──────────────────────────────────┐  ┌─ #sidebar ─┐
 *   │  #game-container (Phaser canvas)              │  │ Module     │
 *   │  #leader-svg    (SVG leader lines, z=20)      │  │ Readout    │
 *   │  #ui-overlay    (title + hints, z=10)         │  │ + Index    │
 *   │  #callout       (anchored chip panel, z=30)   │  │            │
 *   └───────────────────────────────────────────────┘  └────────────┘
 */

'use strict';

// ─── Palette ───────────────────────────────────────────────────────────────

const NEON     = 0x00E5FF;   // primary cyan
const NEON_G   = 0x3CFF7F;   // accent green
const PCB_BG   = 0x0A0F1C;   // substrate dark
const PCB_MID  = 0x0B1628;   // module body
const PCB_GRID = 0x14243A;   // via-hole dots

// ─── World & Physics ───────────────────────────────────────────────────────

const WORLD_W      = 1200;
const WORLD_H      = 900;
const PLAYER_SPEED = 180;
const INTERACT_R   = 88;   // radius for proximity glow + callout
// Distance beyond which the callout shows "Signal lost" and fades:
const SIGNAL_LOST_R = 180;
// Callout offset from station screen position (px):
const CALLOUT_OFFSET = 36;
// Preview bullet count shown in callout:
const CALLOUT_BULLET_PREVIEW = 2;
// Callout viewport padding (px) — keep callout this far from edge:
const CALLOUT_VIEWPORT_PAD = 12;

// ─── Station Definitions ───────────────────────────────────────────────────
// id must match a section id in resume.json.
// Positions align with the circuit-trace grid drawn in _drawWorld().

const STATIONS = [
  // ── Top row: Core Profiles ─────────────────────────────────────────
  { id: 'summary-software',      x: 360,  y: 150, color: NEON,     label: 'CORE.SW'     },
  { id: 'summary-security',      x: 840,  y: 150, color: NEON_G,   label: 'CORE.SEC'    },
  // ── Upper sides: Stacks ────────────────────────────────────────────
  { id: 'core-skills-software',  x: 140,  y: 300, color: NEON,     label: 'STACK.SW'    },
  { id: 'core-skills-security',  x: 1060, y: 300, color: NEON_G,   label: 'STACK.SEC'   },
  // ── Middle band: Recent Experience ────────────────────────────────
  { id: 'experience-humana',     x: 200,  y: 440, color: 0xFF6B9D, label: 'EXP.HUMANA'  },
  { id: 'experience-paladin',    x: 600,  y: 340, color: 0xFF9F1C, label: 'EXP.PALADIN' },
  { id: 'experience-ng-2023',    x: 1000, y: 440, color: NEON,     label: 'EXP.NG-23'   },
  // ── Lower band: Earlier Experience ────────────────────────────────
  { id: 'experience-ng-ia-2020', x: 600,  y: 540, color: 0xAA7CFF, label: 'EXP.NG-IA'  },
  { id: 'experience-utah-dcfs',  x: 200,  y: 600, color: 0xFF6B9D, label: 'EXP.DCFS'   },
  { id: 'experience-earlier',    x: 1000, y: 600, color: 0xAA7CFF, label: 'EXP.PRIOR'  },
  // ── Bottom row: Education & Links ─────────────────────────────────
  { id: 'education-certs',       x: 380,  y: 760, color: 0xFF9F1C, label: 'CREDENTIALS' },
  { id: 'links',                 x: 820,  y: 760, color: NEON_G,   label: 'I/O PORTS'   },
];

// ─── Pulse Trace Definitions ───────────────────────────────────────────────
// Signal pulses animate along these segments each frame.

const PULSE_TRACES = [
  { x1: 20,   y1: 150, x2: 1180, y2: 150,  speed: 0.28 }, // top bus  →
  { x1: 1180, y1: 300, x2: 20,   y2: 300,  speed: 0.22 }, // 2nd row  ←
  { x1: 20,   y1: 440, x2: 1180, y2: 440,  speed: 0.35 }, // mid bus  →
  { x1: 1180, y1: 600, x2: 20,   y2: 600,  speed: 0.30 }, // 4th row  ←
  { x1: 100,  y1: 760, x2: 1100, y2: 760,  speed: 0.40 }, // bottom   →
  { x1: 360,  y1: 20,  x2: 360,  y2: 880,  speed: 0.25 }, // col 2    ↓
  { x1: 600,  y1: 880, x2: 600,  y2: 20,   speed: 0.32 }, // col 3    ↑
  { x1: 840,  y1: 20,  x2: 840,  y2: 880,  speed: 0.28 }, // col 4    ↓
  { x1: 140,  y1: 880, x2: 140,  y2: 20,   speed: 0.20 }, // col 1    ↑
  { x1: 1060, y1: 20,  x2: 1060, y2: 880,  speed: 0.38 }, // col 5    ↓
];

// ─── Module-level shared state ─────────────────────────────────────────────

let sectionMap        = {};   // { id → section } built from resume.json
let calloutOpen       = false;
let calloutStationId  = null; // id of station currently shown in callout
let lastAutoOpenedId  = null; // prevents re-firing callout every frame
let activeScene       = null; // reference to live GameScene for coord queries

// ─────────────────────────────────────────────────────────────────────────────
//  Phaser Scene
// ─────────────────────────────────────────────────────────────────────────────

class GameScene extends Phaser.Scene {

  constructor() {
    super('GameScene');
    this._stations            = [];   // { def, text }
    this._pulses              = [];   // animated pulse state objects
    this._pulseGraphics       = null;
    this._glowGraphics        = null;
    this._leaderGraphics      = null; // unused (SVG used instead)
    this._nearestSceneStation = null; // station used by _updateGlow
    this._leaderPulseT        = 0;    // 0..1 along leader line
    this.player               = null;
    this.cursors              = null;
    this.wasd                 = null;
  }

  preload() {}

  create() {
    activeScene = this;
    this._makeTextures();
    this._drawWorld();
    this._initPulses();
    this._createPlayer();
    this._createStations();
    this._setupCamera();
    this._setupInput();
    this._pulseGraphics = this.add.graphics().setDepth(1);
    this._glowGraphics  = this.add.graphics().setDepth(5);
  }

  update() {
    this._handleMovement();
    this._checkProximity();
    this._updatePulses();
    this._updateGlow();
    this._updateCalloutPosition();
    this._updateLeaderLine();
  }

  // ── Texture: probe reticle ─────────────────────────────────────────

  _makeTextures() {
    const pg = this.add.graphics();
    const cx = 16, cy = 16;

    pg.fillStyle(NEON, 0.05); pg.fillCircle(cx, cy, 16);
    pg.fillStyle(NEON, 0.10); pg.fillCircle(cx, cy, 11);
    pg.lineStyle(1.5, NEON, 0.90); pg.strokeCircle(cx, cy, 8);
    pg.lineStyle(1.5, NEON, 0.80);
    pg.lineBetween(cx, cy - 12, cx, cy - 10);
    pg.lineBetween(cx, cy + 10, cx, cy + 12);
    pg.lineBetween(cx - 12, cy, cx - 10, cy);
    pg.lineBetween(cx + 10, cy, cx + 12, cy);
    pg.lineStyle(1, NEON, 0.45);
    pg.lineBetween(cx, cy - 6, cx, cy - 3);
    pg.lineBetween(cx, cy + 3, cx, cy + 6);
    pg.lineBetween(cx - 6, cy, cx - 3, cy);
    pg.lineBetween(cx + 3, cy, cx + 6, cy);
    pg.fillStyle(0xFFFFFF, 0.95); pg.fillCircle(cx, cy, 1.5);
    pg.fillStyle(NEON,     1.00); pg.fillCircle(cx, cy, 1.0);
    pg.generateTexture('probe', 32, 32);
    pg.destroy();
  }

  // ── World: PCB substrate + traces + pads ──────────────────────────

  _drawWorld() {
    const g = this.add.graphics().setDepth(0);

    g.fillStyle(PCB_BG, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    // Via-hole dot grid (every 40 px)
    g.fillStyle(PCB_GRID, 1);
    for (let gx = 40; gx < WORLD_W; gx += 40)
      for (let gy = 40; gy < WORLD_H; gy += 40)
        g.fillCircle(gx, gy, 1.5);

    // Secondary traces (very dim)
    g.lineStyle(1, NEON, 0.06);
    for (const y of [225, 390, 500, 660]) g.lineBetween(20, y, WORLD_W - 20, y);
    for (const x of [260, 480, 720, 950]) g.lineBetween(x, 20, x, WORLD_H - 20);

    // Primary horizontal traces
    g.lineStyle(1.5, NEON, 0.20);
    for (const y of [150, 300, 440, 600, 760]) g.lineBetween(20, y, WORLD_W - 20, y);

    // Primary vertical traces
    for (const x of [140, 360, 600, 840, 1060]) g.lineBetween(x, 20, x, WORLD_H - 20);

    // Pad circles at intersections
    g.fillStyle(NEON, 0.28);
    for (const y of [150, 300, 440, 600, 760]) {
      for (const x of [140, 360, 600, 840, 1060]) {
        g.fillCircle(x, y, 3.5);
        g.lineStyle(1, NEON, 0.15); g.strokeCircle(x, y, 6);
      }
    }

    // World border frame
    g.lineStyle(1.5, NEON, 0.35); g.strokeRect(6, 6, WORLD_W - 12, WORLD_H - 12);

    // Corner accent brackets
    const B = 22;
    g.lineStyle(2, NEON, 0.80);
    for (const [cx, cy, sx, sy] of [
      [6,         6,         1,  1 ],
      [WORLD_W-6, 6,         -1, 1 ],
      [6,         WORLD_H-6, 1,  -1],
      [WORLD_W-6, WORLD_H-6, -1, -1],
    ]) {
      g.lineBetween(cx, cy, cx + sx * B, cy);
      g.lineBetween(cx, cy, cx, cy + sy * B);
    }

    // Silkscreen text (decorative)
    for (const [tx, ty, anchor, str] of [
      [26,         24,         0, 'REV 3.0'   ],
      [WORLD_W-26, 24,         1, 'BRENDON.E' ],
      [26,         WORLD_H-24, 0, 'LAYER 01'  ],
      [WORLD_W-26, WORLD_H-24, 1, '© 2025'    ],
    ]) {
      this.add.text(tx, ty, str, {
        fontSize: '9px', fontFamily: '"Courier New", monospace', color: '#0D2035',
      }).setDepth(0).setOrigin(anchor, 0.5);
    }
  }

  // ── Pulse state ────────────────────────────────────────────────────

  _initPulses() {
    this._pulses = PULSE_TRACES.map((tr, i) => ({
      ...tr,
      t: i / PULSE_TRACES.length,
    }));
  }

  // ── Player ────────────────────────────────────────────────────────

  _createPlayer() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.player = this.physics.add.sprite(600, 80, 'probe');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(8);
  }

  // ── Stations: IC chip modules ──────────────────────────────────────

  _createStations() {
    this._stations = [];
    const bg = this.add.graphics().setDepth(2);

    for (const def of STATIONS) {
      this._drawModuleBody(bg, def.x, def.y, def.color);

      const text = this.add.text(def.x, def.y, def.label, {
        fontSize:        '9px',
        fontFamily:      '"Courier New", monospace',
        color:           '#00E5FF',
        align:           'center',
        wordWrap:        { width: 82, useAdvancedWrap: false },
        stroke:          '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5, 0.5).setDepth(4);

      this._stations.push({ def, text });
    }
  }

  _drawModuleBody(g, cx, cy, accentColor) {
    const W = 90, H = 44;
    const hw = W / 2, hh = H / 2;
    const PIN_LEN = 10;
    const PINS = [-14, 0, 14];

    g.fillStyle(PCB_MID, 1);
    g.fillRect(cx - hw, cy - hh, W, H);
    g.lineStyle(1, NEON, 0.035);
    for (let ly = cy - hh + 9; ly < cy + hh; ly += 9)
      g.lineBetween(cx - hw + 3, ly, cx + hw - 3, ly);
    g.lineStyle(1.5, NEON, 0.42);
    g.strokeRect(cx - hw, cy - hh, W, H);
    g.fillStyle(NEON, 0.70); g.fillCircle(cx - hw + 5, cy - hh + 5, 2.5);
    g.lineStyle(1, NEON, 0.38);
    for (const po of PINS) {
      const py = cy + po;
      g.lineBetween(cx - hw - PIN_LEN, py, cx - hw, py);
      g.lineBetween(cx + hw, py, cx + hw + PIN_LEN, py);
      g.fillStyle(NEON, 0.40);
      g.fillRect(cx - hw - PIN_LEN - 2, py - 2, 4, 4);
      g.fillRect(cx + hw + PIN_LEN - 2, py - 2, 4, 4);
    }
  }

  // ── Camera ────────────────────────────────────────────────────────

  _setupCamera() {
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
  }

  // ── Input ─────────────────────────────────────────────────────────

  _setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.UP,   Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT, Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.W,    Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,    Phaser.Input.Keyboard.KeyCodes.D,
    ]);
  }

  // ── Movement ──────────────────────────────────────────────────────

  _handleMovement() {
    const { cursors, wasd, player } = this;
    let vx = 0, vy = 0;
    if (cursors.left.isDown  || wasd.left.isDown)  vx = -PLAYER_SPEED;
    if (cursors.right.isDown || wasd.right.isDown) vx =  PLAYER_SPEED;
    if (cursors.up.isDown    || wasd.up.isDown)    vy = -PLAYER_SPEED;
    if (cursors.down.isDown  || wasd.down.isDown)  vy =  PLAYER_SPEED;
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
    player.setVelocity(vx, vy);
  }

  // ── Proximity: glow + auto-open callout ───────────────────────────

  _checkProximity() {
    const { x: px, y: py } = this.player;
    let nearest = null, minDist = Infinity;

    for (const s of this._stations) {
      const dist = Math.hypot(s.def.x - px, s.def.y - py);
      if (dist < INTERACT_R && dist < minDist) { minDist = dist; nearest = s; }
    }

    this._nearestSceneStation = nearest;

    if (nearest) {
      if (nearest.def.id !== lastAutoOpenedId) {
        lastAutoOpenedId = nearest.def.id;
        onStationInteract(nearest.def.id, nearest.def.x, nearest.def.y, nearest.def.label);
      }
    } else {
      // If player moved away entirely, reset so re-entry re-opens
      if (lastAutoOpenedId !== null) lastAutoOpenedId = null;
    }

    // Signal-lost check for open callout
    if (calloutOpen && calloutStationId) {
      const st = this._stations.find(s => s.def.id === calloutStationId);
      if (st) {
        const dist = Math.hypot(st.def.x - px, st.def.y - py);
        const signalEl = document.getElementById('callout-signal');
        if (dist > SIGNAL_LOST_R) {
          if (signalEl && !signalEl.textContent) {
            signalEl.textContent = '⚠ SIGNAL LOST';
          }
          const calloutEl = document.getElementById('callout');
          if (calloutEl && !calloutEl.classList.contains('signal-lost')) {
            calloutEl.classList.add('signal-lost');
            setTimeout(() => { if (calloutStationId === st.def.id) closeCallout(); }, 600);
          }
        } else {
          if (signalEl) signalEl.textContent = '';
          const calloutEl = document.getElementById('callout');
          if (calloutEl) calloutEl.classList.remove('signal-lost');
        }
      }
    }
  }

  // ── Update callout position each frame (camera-follow) ────────────

  _updateCalloutPosition() {
    if (!calloutOpen || !calloutStationId) return;
    const st = this._stations.find(s => s.def.id === calloutStationId);
    if (!st) return;
    positionCallout(st.def.x, st.def.y);
  }

  // ── Update SVG leader line each frame ─────────────────────────────

  _updateLeaderLine() {
    if (!calloutOpen || !calloutStationId) {
      clearLeaderLine();
      return;
    }
    const st = this._stations.find(s => s.def.id === calloutStationId);
    if (!st) { clearLeaderLine(); return; }

    // Advance pulse t
    const dt = this.game.loop.delta;
    this._leaderPulseT = (this._leaderPulseT + dt * 0.00045) % 1;

    drawLeaderLine(st.def.x, st.def.y, this._leaderPulseT);
  }

  // ── Animated: signal pulses along traces ──────────────────────────

  _updatePulses() {
    const g  = this._pulseGraphics;
    const dt = this.game.loop.delta;
    g.clear();

    for (const p of this._pulses) {
      p.t = (p.t + p.speed * dt * 0.0001) % 1;
      const x = p.x1 + (p.x2 - p.x1) * p.t;
      const y = p.y1 + (p.y2 - p.y1) * p.t;
      g.fillStyle(NEON, 0.08); g.fillCircle(x, y, 9);
      g.fillStyle(NEON, 0.22); g.fillCircle(x, y, 5);
      g.fillStyle(NEON, 0.60); g.fillCircle(x, y, 2.5);
      g.fillStyle(0xFFFFFF, 0.85); g.fillCircle(x, y, 1);
    }
  }

  // ── Animated: proximity glow ──────────────────────────────────────

  _updateGlow() {
    const g = this._glowGraphics;
    g.clear();
    if (!this._nearestSceneStation) return;

    const { x, y } = this._nearestSceneStation.def;
    const W = 90, H = 44, hw = W / 2, hh = H / 2;
    const pulse = 0.55 + 0.35 * Math.sin(this.time.now * 0.004);

    g.lineStyle(14, NEON, 0.035 * pulse);
    g.strokeRect(x - hw - 10, y - hh - 10, W + 20, H + 20);
    g.lineStyle(5, NEON, 0.13 * pulse);
    g.strokeRect(x - hw - 4,  y - hh - 4,  W + 8,  H + 8);
    g.lineStyle(2, NEON, 0.65 + 0.28 * pulse);
    g.strokeRect(x - hw - 1,  y - hh - 1,  W + 2,  H + 2);
  }

  // ── Public: convert world coords to game-area screen coords ───────

  worldToScreen(worldX, worldY) {
    const cam = this.cameras.main;
    // Phaser Scale gives us the actual pixel size the canvas is rendered at
    const scaleX = this.scale.displaySize.width  / this.scale.gameSize.width;
    const scaleY = this.scale.displaySize.height / this.scale.gameSize.height;

    // Canvas offset within #game-container (centred by CSS flex)
    const container = document.getElementById('game-container');
    const canvas    = container.querySelector('canvas');
    const canvasRect = canvas ? canvas.getBoundingClientRect() : container.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const canvasOffsetX = canvasRect.left - containerRect.left;
    const canvasOffsetY = canvasRect.top  - containerRect.top;

    const screenX = canvasOffsetX + (worldX - cam.worldView.x) * scaleX;
    const screenY = canvasOffsetY + (worldY - cam.worldView.y) * scaleY;
    return { x: screenX, y: screenY };
  }

  playerScreen() {
    return this.worldToScreen(this.player.x, this.player.y);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Callout placement logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Place the callout near the station screen position, away from the player.
 * Candidates: top-right, top-left, bottom-right, bottom-left.
 * Picks the candidate that maximises distance from the player and stays in-viewport.
 */
function positionCallout(stationWorldX, stationWorldY) {
  if (!activeScene) return;
  const calloutEl = document.getElementById('callout');
  if (!calloutEl || calloutEl.classList.contains('hidden')) return;

  const { x: sx, y: sy } = activeScene.worldToScreen(stationWorldX, stationWorldY);
  const { x: px, y: py } = activeScene.playerScreen();

  const cw = calloutEl.offsetWidth  || 220;
  const ch = calloutEl.offsetHeight || 160;

  // Game area dimensions (callout is positioned relative to #game-area)
  const gameArea = document.getElementById('game-area');
  const gaW = gameArea.offsetWidth;
  const gaH = gameArea.offsetHeight;

  const OFF = CALLOUT_OFFSET;
  const PAD = CALLOUT_VIEWPORT_PAD;

  // Four candidate origins (top-left corner of callout)
  const candidates = [
    { name: 'top-right',    left: sx + OFF,      top: sy - ch - OFF  },
    { name: 'top-left',     left: sx - cw - OFF, top: sy - ch - OFF  },
    { name: 'bottom-right', left: sx + OFF,      top: sy + OFF       },
    { name: 'bottom-left',  left: sx - cw - OFF, top: sy + OFF       },
  ];

  // Filter to candidates that fit within the game area with padding
  const fits = candidates.filter(c =>
    c.left >= PAD && c.top >= PAD &&
    c.left + cw <= gaW - PAD &&
    c.top  + ch <= gaH - PAD
  );

  // From fitting candidates, prefer the one farthest from the player
  const pool = fits.length > 0 ? fits : candidates;
  let best = pool[0], bestDist = -1;
  for (const c of pool) {
    const centrX = c.left + cw / 2;
    const centrY = c.top  + ch / 2;
    const d = Math.hypot(centrX - px, centrY - py);
    if (d > bestDist) { bestDist = d; best = c; }
  }

  // Clamp to game area
  const clampedLeft = Math.max(PAD, Math.min(best.left, gaW - cw - PAD));
  const clampedTop  = Math.max(PAD, Math.min(best.top,  gaH - ch - PAD));

  calloutEl.style.left = clampedLeft + 'px';
  calloutEl.style.top  = clampedTop  + 'px';
}

// ─────────────────────────────────────────────────────────────────────────────
//  SVG Leader Line
// ─────────────────────────────────────────────────────────────────────────────

function drawLeaderLine(stationWorldX, stationWorldY, pulseT) {
  if (!activeScene) return;
  const svg = document.getElementById('leader-svg');
  if (!svg) return;

  const calloutEl = document.getElementById('callout');
  if (!calloutEl || calloutEl.classList.contains('hidden')) {
    clearLeaderLine(); return;
  }

  const { x: sx, y: sy } = activeScene.worldToScreen(stationWorldX, stationWorldY);

  // Callout edge — find the closest point on the callout border to the station
  const cRect = calloutEl.getBoundingClientRect();
  const gameArea = document.getElementById('game-area');
  const gaRect   = gameArea.getBoundingClientRect();

  // Convert callout rect to game-area-local coords (same coord system as worldToScreen)
  const cLeft   = cRect.left   - gaRect.left;
  const cTop    = cRect.top    - gaRect.top;
  const cRight  = cRect.right  - gaRect.left;
  const cBottom = cRect.bottom - gaRect.top;
  const cCX = (cLeft + cRight)  / 2;
  const cCY = (cTop  + cBottom) / 2;

  // Clamp station→callout-centre vector to callout border
  const dx = sx - cCX, dy = sy - cCY;
  let ex, ey; // exit point on callout border
  if (Math.abs(dx) === 0 && Math.abs(dy) === 0) { ex = cCX; ey = cTop; }
  else {
    const hw = (cRight - cLeft) / 2, hh = (cBottom - cTop) / 2;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    if (absDx * hh > absDy * hw) {
      // Exits through left or right
      const t = hw / absDx;
      ex = cCX + Math.sign(dx) * hw;
      ey = cCY + dy * t;
    } else {
      // Exits through top or bottom
      const t = hh / absDy;
      ex = cCX + dx * t;
      ey = cCY + Math.sign(dy) * hh;
    }
  }

  // Orthogonal elbow: go horizontal then vertical (or vice-versa if shorter)
  const midX = ex + (sx - ex) * 0.5;

  // Build polyline points: callout-edge → mid-elbow → station
  const pts = `${ex},${ey} ${midX},${ey} ${midX},${sy} ${sx},${sy}`;

  // Upsert <polyline>
  let line = svg.querySelector('.leader-line');
  if (!line) {
    line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('class', 'leader-line');
    svg.appendChild(line);
  }
  line.setAttribute('points', pts);

  // Pulse dot travelling along the line
  // Simplified: interpolate along the elbow path segments
  const totalDist = (
    Math.hypot(midX - ex, 0) +
    Math.hypot(0, sy - ey) +
    Math.hypot(sx - midX, 0)
  );
  const traveled = pulseT * totalDist;
  const seg1 = Math.abs(midX - ex);
  const seg2 = Math.abs(sy   - ey);

  let dotX, dotY;
  if (traveled <= seg1) {
    dotX = ex + (midX - ex) * (traveled / (seg1 || 1));
    dotY = ey;
  } else if (traveled <= seg1 + seg2) {
    dotX = midX;
    dotY = ey + (sy - ey) * ((traveled - seg1) / (seg2 || 1));
  } else {
    const rem = traveled - seg1 - seg2;
    const seg3 = Math.abs(sx - midX);
    dotX = midX + (sx - midX) * (rem / (seg3 || 1));
    dotY = sy;
  }

  let dot = svg.querySelector('.leader-pulse');
  if (!dot) {
    dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('class', 'leader-pulse');
    dot.setAttribute('r', '3');
    svg.appendChild(dot);
  }
  dot.setAttribute('cx', dotX);
  dot.setAttribute('cy', dotY);
}

function clearLeaderLine() {
  const svg = document.getElementById('leader-svg');
  if (!svg) return;
  svg.innerHTML = '';
}

// ─────────────────────────────────────────────────────────────────────────────
//  Station interaction handler (called by Phaser scene)
// ─────────────────────────────────────────────────────────────────────────────

function onStationInteract(sectionId, worldX, worldY, moduleLabel) {
  const section = sectionMap[sectionId];
  if (!section) {
    console.warn('[Resume] onStationInteract: no section for id:', sectionId);
    return;
  }

  // Update sidebar regardless
  updateSidebar(section, sectionId);

  // Open or update callout
  showCallout(section, sectionId, moduleLabel, worldX, worldY);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Callout DOM functions
// ─────────────────────────────────────────────────────────────────────────────

function showCallout(section, sectionId, moduleLabel, worldX, worldY) {
  calloutStationId = sectionId;

  const el = document.getElementById('callout');
  document.getElementById('callout-label').textContent = moduleLabel || sectionId;
  document.getElementById('callout-title').textContent = section.title;

  // Preview bullets (first N)
  const ul = document.getElementById('callout-bullets');
  ul.innerHTML = '';
  const preview = section.bullets.slice(0, CALLOUT_BULLET_PREVIEW);
  for (const b of preview) {
    const li = document.createElement('li');
    li.textContent = b;
    ul.appendChild(li);
  }

  document.getElementById('callout-signal').textContent = '';
  el.classList.remove('hidden', 'signal-lost');

  // Force reflow to re-trigger animation when switching between stations
  void el.offsetWidth;
  el.style.animation = 'none';
  requestAnimationFrame(() => { el.style.animation = ''; });

  calloutOpen = true;

  // Position after display (needs offsetWidth/Height)
  requestAnimationFrame(() => {
    positionCallout(worldX, worldY);
  });
}

function closeCallout() {
  const el = document.getElementById('callout');
  if (el) { el.classList.add('hidden'); el.classList.remove('signal-lost'); }
  clearLeaderLine();
  calloutOpen      = false;
  calloutStationId = null;
  // Allow re-opening the same station after explicit close
  lastAutoOpenedId = null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Sidebar DOM functions
// ─────────────────────────────────────────────────────────────────────────────

function updateSidebar(section, sectionId) {
  // Section ID tag
  document.getElementById('sidebar-section-id').textContent = sectionId.toUpperCase();

  // Title
  document.getElementById('sidebar-title').textContent = section.title;

  // Bullets
  const ul = document.getElementById('sidebar-bullets');
  ul.innerHTML = '';
  for (const b of section.bullets) {
    const li = document.createElement('li');
    li.textContent = b;
    ul.appendChild(li);
  }

  // Optional link
  const lw = document.getElementById('sidebar-link');
  lw.innerHTML = '';
  if (section.link) {
    const a = document.createElement('a');
    a.href = section.link.url;
    a.textContent = section.link.label;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'sidebar-link-btn';
    lw.appendChild(a);
  }

  // Show content, hide empty state
  document.getElementById('sidebar-empty').classList.add('hidden');
  const contentEl = document.getElementById('sidebar-content');
  contentEl.classList.remove('hidden');
  // Re-trigger entry animation
  contentEl.classList.remove('panel-anim');
  void contentEl.offsetWidth;
  contentEl.classList.add('panel-anim');

  // Highlight active index item
  document.querySelectorAll('.index-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sectionId === sectionId);
  });

  // Expand sidebar if collapsed (desktop) or open drawer (mobile)
  const sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('collapsed')) {
    // Only auto-expand on desktop (sidebar has fixed width)
    if (window.innerWidth > 700) {
      sidebar.classList.remove('collapsed');
      document.getElementById('sidebar-toggle').setAttribute('aria-expanded', 'true');
      document.getElementById('sidebar-toggle').textContent = '◀';
    }
  }
  // Mobile: open drawer
  if (window.innerWidth <= 700) {
    sidebar.classList.add('drawer-open');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Index list population
// ─────────────────────────────────────────────────────────────────────────────

function buildIndexList() {
  const ul = document.getElementById('sidebar-index-list');
  ul.innerHTML = '';
  for (const section of Object.values(sectionMap)) {
    const li  = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'index-item';
    btn.textContent = section.title;
    btn.dataset.sectionId = section.id;
    btn.addEventListener('click', () => {
      updateSidebar(section, section.id);
      // Optionally: show callout-less readout when selecting from index
      // (no station interaction needed — sidebar updates directly)
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  DOM event wiring
// ─────────────────────────────────────────────────────────────────────────────

function setupDOM() {
  // Callout close button
  document.getElementById('callout-close').addEventListener('click', closeCallout);

  // "Open in Readout" button (sidebar is already updated on interact; just focuses/expands it)
  document.getElementById('callout-open-btn').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('collapsed');
    if (window.innerWidth <= 700) sidebar.classList.add('drawer-open');
    document.getElementById('sidebar-toggle').setAttribute('aria-expanded', 'true');
    document.getElementById('sidebar-toggle').textContent = '◀';
    // Scroll sidebar body to top so user sees the title
    document.getElementById('sidebar-body').scrollTop = 0;
  });

  // Click outside callout to close
  document.getElementById('game-area').addEventListener('click', (e) => {
    if (!e.target.closest('#callout')) closeCallout();
  });

  // Sidebar collapse/expand
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar   = document.getElementById('sidebar');
  toggleBtn.addEventListener('click', () => {
    const isMobile   = window.innerWidth <= 700;
    if (isMobile) {
      const open = sidebar.classList.toggle('drawer-open');
      toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggleBtn.textContent = open ? '▼' : '▲';
    } else {
      const collapsed = sidebar.classList.toggle('collapsed');
      toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggleBtn.textContent = collapsed ? '▶' : '◀';
    }
  });

  // Esc closes callout only (sidebar persists)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCallout();
  });

  // Mobile: init toggle button label
  if (window.innerWidth <= 700) {
    toggleBtn.textContent = '▲';
    toggleBtn.setAttribute('aria-label', 'Open module readout');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Entry Point
// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  const loader = document.getElementById('loading');
  try {
    const res = await fetch('./content/resume.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    for (const s of data.sections) sectionMap[s.id] = s;

    if (loader) loader.remove();
    setupDOM();
    buildIndexList();

    new Phaser.Game({
      type:            Phaser.AUTO,
      parent:          'game-container',
      backgroundColor: '#0A0F1C',
      scale: {
        mode:       Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width:      800,
        height:     600,
      },
      physics: {
        default: 'arcade',
        arcade:  { gravity: { y: 0 }, debug: false },
      },
      scene: GameScene,
    });

  } catch (err) {
    console.error('[Resume] load error:', err);
    if (loader) {
      loader.textContent = `BOOT ERROR: ${err.message}`;
      loader.style.color = '#FF4466';
    }
  }
})();
