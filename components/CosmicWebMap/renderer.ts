import {
  BG,
  HALO_PALETTE,
  JUNCTION,
  KNOT,
  MATTER_BRIGHT,
  MATTER_DIM,
  MATTER_WARM,
  NAMED_JUNCTIONS,
  NEBULA,
  NEBULA_REGIONS,
  PARTICLE_LAYERS,
  VIEW_H,
  VIEW_W,
  type MatterStop,
} from "./colors";
import { drawGlyph } from "./glyphs";
import type { Filament, Halo, Strength } from "./types";

function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPRITE_SIZE = 64;

function makeClumpSprite(stops: MatterStop[]): HTMLCanvasElement {
  const s = SPRITE_SIZE;
  const c = document.createElement("canvas");
  c.width = c.height = s * 2;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s, s, 0, s, s, s);
  for (const stop of stops) g.addColorStop(stop.offset, rgba(stop.color, stop.alpha));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s * 2, s * 2);
  return c;
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const sx = rx / SPRITE_SIZE;
  const sy = ry / SPRITE_SIZE;
  ctx.scale(sx, sy);
  ctx.drawImage(sprite, -SPRITE_SIZE, -SPRITE_SIZE);
  ctx.restore();
}

interface Sprites {
  bright: HTMLCanvasElement;
  warm: HTMLCanvasElement;
  dim: HTMLCanvasElement;
  knot: HTMLCanvasElement;
  junction: HTMLCanvasElement;
}

function makeSprites(): Sprites {
  return {
    bright: makeClumpSprite(MATTER_BRIGHT),
    warm: makeClumpSprite(MATTER_WARM),
    dim: makeClumpSprite(MATTER_DIM),
    knot: makeClumpSprite(KNOT),
    junction: makeClumpSprite(JUNCTION),
  };
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawNebulaTints(ctx: CanvasRenderingContext2D) {
  for (const region of NEBULA_REGIONS) {
    const { color, alpha } = NEBULA[region.domain];
    const r = Math.max(region.rx, region.ry);
    const g = ctx.createRadialGradient(region.cx, region.cy, 0, region.cx, region.cy, r);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.save();
    ctx.translate(region.cx, region.cy);
    ctx.scale(region.rx / r, region.ry / r);
    ctx.translate(-region.cx, -region.cy);
    ctx.fillStyle = g;
    ctx.fillRect(region.cx - r, region.cy - r, r * 2, r * 2);
    ctx.restore();
  }
}

function drawParticleField(ctx: CanvasRenderingContext2D) {
  for (const layer of PARTICLE_LAYERS) {
    const rand = mulberry32(layer.seed);
    ctx.fillStyle = layer.color;
    ctx.globalAlpha = layer.alpha;
    for (let i = 0; i < layer.count; i++) {
      const x = rand() * VIEW_W;
      const y = rand() * VIEW_H;
      ctx.beginPath();
      ctx.arc(x, y, layer.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// Background ambient web (short strands and long chains) was deleted in this
// pass — the user flagged it as noise. The cosmic-web texture now comes from:
// the nebula tints (per-domain), the particle field (sparse dots), the
// inter-halo filaments (matter chains), the named-junction blooms, and the
// faint dashed cross-cluster connections. Halos sit *in* that, not on bare bg.

function strengthSprite(strength: Strength, sprites: Sprites): HTMLCanvasElement {
  if (strength === "primary") return sprites.bright;
  if (strength === "medium") return sprites.warm;
  return sprites.dim;
}

function strengthSize(strength: Strength): { rx: number; ry: number; step: number } {
  if (strength === "primary") return { rx: 5.5, ry: 2.6, step: 5.5 };
  // Medium denser + slightly bigger so the infrastructure backbone reads as a chain.
  if (strength === "medium") return { rx: 4.7, ry: 2.2, step: 4.5 };
  return { rx: 3.0, ry: 1.4, step: 6.0 };
}

function drawFilaments(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  filaments: Filament[],
  halosById: Map<string, Halo>
) {
  const rand = mulberry32(101);
  for (const f of filaments) {
    if (f.strength === "faint") continue; // faint cross-cluster handled separately
    const a = halosById.get(f.from_halo_id);
    const b = halosById.get(f.to_halo_id);
    if (!a || !b) continue;

    // Endpoints at the halo edges
    const dx = b.position_x - a.position_x;
    const dy = b.position_y - a.position_y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const ux = dx / len;
    const uy = dy / len;
    const x1 = a.position_x + ux * (a.radius * 0.85);
    const y1 = a.position_y + uy * (a.radius * 0.85);
    const x2 = b.position_x - ux * (b.radius * 0.85);
    const y2 = b.position_y - uy * (b.radius * 0.85);

    // Control point: junction if specified, else slight perpendicular offset
    let cx: number, cy: number;
    if (f.via_junction) {
      const j = NAMED_JUNCTIONS.find((n) => n.id === f.via_junction);
      if (j) {
        cx = j.x;
        cy = j.y;
      } else {
        cx = (x1 + x2) / 2;
        cy = (y1 + y2) / 2;
      }
    } else {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const off = (rand() - 0.5) * len * 0.1;
      cx = mx + -uy * off;
      cy = my + ux * off;
    }

    // Sample along quadratic Bezier
    const { rx, ry, step } = strengthSize(f.strength);
    const sprite = strengthSprite(f.strength, sprites);
    // approximate length by sampling
    const samples = 16;
    let arc = 0;
    let prev = { x: x1, y: y1 };
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
      const y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
      arc += Math.hypot(x - prev.x, y - prev.y);
      prev = { x, y };
    }
    const n = Math.max(3, Math.floor(arc / step));
    // Two-pass render: each clump gets a much wider, low-alpha dim underlay
    // (the soft "neuron" glow) plus the strength-appropriate bright core on
    // top. The underlay is wide and diffuse so the chain reads as a glowing
    // ribbon rather than a row of beads.
    const underlayScale = 3.2;
    const underlayAlpha = 0.38;
    for (let pass = 0; pass < 2; pass++) {
      // Reset the RNG seed per pass so clump positions match between layers.
      const r2 = mulberry32(202 + (f.from_halo_id.length + f.to_halo_id.length) * 7);
      if (pass === 0) ctx.globalAlpha = underlayAlpha;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
        const y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
        const tx = 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx);
        const ty = 2 * (1 - t) * (cy - y1) + 2 * t * (y2 - cy);
        const ang = Math.atan2(ty, tx);
        const perp = (r2() - 0.5) * 1.6;
        const px = x + -Math.sin(ang) * perp;
        const py = y + Math.cos(ang) * perp;
        const sizeJ = 0.85 + r2() * 0.4;
        if (pass === 0) {
          drawSprite(
            ctx,
            sprites.dim,
            px,
            py,
            rx * sizeJ * underlayScale,
            ry * sizeJ * underlayScale,
            ang
          );
        } else {
          drawSprite(ctx, sprite, px, py, rx * sizeJ, ry * sizeJ, ang);
        }
      }
      if (pass === 0) ctx.globalAlpha = 1;
    }
  }
}

function drawCrossClusterFaint(
  ctx: CanvasRenderingContext2D,
  filaments: Filament[],
  halosById: Map<string, Halo>
) {
  ctx.save();
  ctx.strokeStyle = rgba("#9050A0", 0.21);
  ctx.lineWidth = 0.9;
  ctx.setLineDash([3, 4]);
  for (const f of filaments) {
    if (f.strength !== "faint") continue;
    const a = halosById.get(f.from_halo_id);
    const b = halosById.get(f.to_halo_id);
    if (!a || !b) continue;
    const dx = b.position_x - a.position_x;
    const dy = b.position_y - a.position_y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const x1 = a.position_x + ux * (a.radius + 4);
    const y1 = a.position_y + uy * (a.radius + 4);
    const x2 = b.position_x - ux * (b.radius + 4);
    const y2 = b.position_y - uy * (b.radius + 4);
    const mx = (x1 + x2) / 2 + -uy * len * 0.06;
    const my = (y1 + y2) / 2 + ux * len * 0.06;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(mx, my, x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

// Named-junction blooms removed by request — they were competing with the
// halos visually. The methodology clusters still read because filaments
// converge through them.

function drawKnots(
  ctx: CanvasRenderingContext2D,
  sprites: Sprites,
  filaments: Filament[],
  halosById: Map<string, Halo>
) {
  // place a knot on each primary filament's midpoint
  for (const f of filaments) {
    if (f.strength !== "primary") continue;
    const a = halosById.get(f.from_halo_id);
    const b = halosById.get(f.to_halo_id);
    if (!a || !b) continue;
    const mx = (a.position_x + b.position_x) / 2;
    const my = (a.position_y + b.position_y) / 2;
    drawSprite(ctx, sprites.knot, mx, my, 9, 9, 0);
  }
}

// Per-halo override for the *outer* haze radius (otherwise r * 1.78).
// Thesis is the gravitational center of the map — bumping its outer haze
// to 130 better embeds it in the cosmic web (matches v8 §3 instructions).
const HAZE_OUTER_OVERRIDE: Record<string, number> = {
  thesis: 130,
};

function drawHalo(ctx: CanvasRenderingContext2D, halo: Halo, hover = false) {
  const palette = HALO_PALETTE[halo.domain];
  const { position_x: x, position_y: y, radius: r } = halo;

  // Mask the halo interior so background filaments/particles/dashes don't
  // bleed through and clutter the glyph. The haze still extends past `r` and
  // blends with the cosmic web outside the boundary, preserving "embedded".
  ctx.fillStyle = BG;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.98, 0, Math.PI * 2);
  ctx.fill();

  // Two stacked haze layers — outer (~1.78r) + mid (~1.25r) — so the brighter
  // core where they overlap reads as "embedded in matter" rather than a flat
  // disc on the background. Mirrors v8's three-circle stack approximation.
  const outerR = HAZE_OUTER_OVERRIDE[halo.id] ?? r * 1.78;
  const midR = r * 1.25;

  const drawHazeLayer = (radius: number, alphaScale: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    for (const stop of palette.haze) {
      const a = (hover ? Math.min(1, stop.alpha * 1.3) : stop.alpha) * alphaScale;
      g.addColorStop(stop.offset, rgba(stop.color, a));
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };
  drawHazeLayer(outerR, 0.85);
  drawHazeLayer(midR, 0.7);

  // Thin boundary outline (dashed for locked halos per v8)
  ctx.save();
  ctx.strokeStyle = rgba(palette.outline, hover ? 1 : 0.55);
  ctx.lineWidth = hover ? 0.9 : 0.6;
  if (halo.status === "locked") ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Glyph
  drawGlyph(ctx, halo.glyph_type, x, y, r, palette.glyph);
}

// Per-halo label-offset overrides (added on top of `radius + 18`).
// CCA · NY trip label was clipping its outer haze in v0.
const LABEL_OFFSET_BUMP: Record<string, number> = {
  "cca-ny-trip": 5,
};

function drawHaloLabel(ctx: CanvasRenderingContext2D, halo: Halo) {
  const palette = HALO_PALETTE[halo.domain];
  const fontSize = halo.radius >= 36 ? 13 : 11;
  const weight = halo.radius >= 36 ? "500" : "400";
  ctx.font = `${weight} ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = palette.nameColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.globalAlpha = 0.95;
  const bump = LABEL_OFFSET_BUMP[halo.id] ?? 0;
  ctx.fillText(
    halo.name,
    halo.position_x,
    halo.position_y + halo.radius + 18 + bump
  );
  ctx.globalAlpha = 1;
}

function drawDomainLabels(ctx: CanvasRenderingContext2D) {
  const labels: { text: string; x: number; y: number; align: CanvasTextAlign }[] = [
    // RESEARCH: top-left of the research nebula, clear of opt-transport haze
    // and clear of the claude-arxiv halo label above.
    { text: "RESEARCH", x: 35, y: 200, align: "left" },
    { text: "CAREER", x: 700, y: 100, align: "right" },
    { text: "INFRASTRUCTURE", x: 30, y: 30, align: "left" },
    // TEACHING: anchored above the AstroStat halo (the only teaching halo).
    // Was floating in the bottom-right corner, far from its cluster.
    { text: "TEACHING", x: 551, y: 430, align: "center" },
    // PERSONAL · PRIVATE: anchored to the right of personal-private halo,
    // inside its nebula. Was stacked under TEACHING far from any halo.
    { text: "PERSONAL · PRIVATE", x: 410, y: 590, align: "left" },
  ];
  ctx.font = "500 9.5px ui-monospace, 'SF Mono', Menlo, monospace";
  ctx.fillStyle = rgba("#D4A8C8", 0.45);
  ctx.textBaseline = "alphabetic";
  for (const l of labels) {
    ctx.textAlign = l.align;
    ctx.fillText(l.text, l.x, l.y);
  }
  ctx.textAlign = "left";
}

function drawTitleChrome(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";

  // ATLAS — matches v8 sizing/letter-spacing/color
  ctx.fillStyle = rgba("#D8D8E0", 0.85);
  ctx.font = "500 14px ui-sans-serif, system-ui, sans-serif";
  // letterSpacing requires the modern 2D context API; cast to access it.
  type WithLetterSpacing = CanvasRenderingContext2D & { letterSpacing?: string };
  const ctxWithSpacing = ctx as WithLetterSpacing;
  const prevSpacing = ctxWithSpacing.letterSpacing;
  ctxWithSpacing.letterSpacing = "8px";
  ctx.fillText("ATLAS", 640, 40);
  ctxWithSpacing.letterSpacing = "0px";

  // Underline rule
  ctx.strokeStyle = rgba("#D8D8E0", 0.45);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(540, 46);
  ctx.lineTo(640, 46);
  ctx.stroke();

  // COSMIC WEB · v0
  ctx.fillStyle = rgba("#A878B0", 0.8);
  ctx.font = "400 7px ui-monospace, 'SF Mono', Menlo, monospace";
  ctxWithSpacing.letterSpacing = "2.5px";
  ctx.fillText("COSMIC WEB · v0", 640, 57);
  ctxWithSpacing.letterSpacing = prevSpacing ?? "0px";
  ctx.restore();
}

export interface RenderOptions {
  halos: Halo[];
  filaments: Filament[];
}

// Render all static layers (everything except the hover overlay) into ctx.
// Caller is responsible for setting up the transform from view -> pixels.
export function renderStatic(ctx: CanvasRenderingContext2D, opts: RenderOptions) {
  const sprites = makeSprites();
  const halosById = new Map(opts.halos.map((h) => [h.id, h]));

  drawBackground(ctx);
  drawNebulaTints(ctx);
  drawParticleField(ctx);
  drawCrossClusterFaint(ctx, opts.filaments, halosById);
  drawFilaments(ctx, sprites, opts.filaments, halosById);
  drawKnots(ctx, sprites, opts.filaments, halosById);

  for (const halo of opts.halos) drawHalo(ctx, halo);
  for (const halo of opts.halos) drawHaloLabel(ctx, halo);

  drawDomainLabels(ctx);
  drawTitleChrome(ctx);
}

// Draw the hover overlay (a brighter version of the hovered halo) on top.
export function renderHoverOverlay(
  ctx: CanvasRenderingContext2D,
  halo: Halo
) {
  drawHalo(ctx, halo, true);
  drawHaloLabel(ctx, halo);
}
