import type { GlyphType } from "./types";

type GlyphFn = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string
) => void;

// All glyphs are authored as pixel offsets from the halo center at the SVG's
// canonical halo radius (Rsvg). At draw time we scale by `s = r / Rsvg` so the
// glyph sits correctly inside any halo radius. Coordinates and stroke widths
// taken directly from references/atlas_cosmic_web_v8.svg.

const stroke = (ctx: CanvasRenderingContext2D, color: string, w: number, alpha = 1) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.globalAlpha = alpha;
};

const fill = (ctx: CanvasRenderingContext2D, color: string, alpha = 1) => {
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
};

const dot = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};

const lineSeg = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) => {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
};

// ─── Thesis (Rsvg=60): hex DAG + Einstein rings + bright hub ─────────────
const thesis_dag_lens: GlyphFn = (ctx, x, y, r, c) => {
  const Ro = r * 0.83;
  const Ri = r * 0.65;

  // Outer dashed boundary hexagon
  ctx.save();
  stroke(ctx, c, 0.5, 0.5);
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const px = x + Math.cos(a) * Ro;
    const py = y + Math.sin(a) * Ro;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  const sats: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    sats.push({ x: x + Math.cos(a) * Ri, y: y + Math.sin(a) * Ri });
  }

  stroke(ctx, c, 0.6, 0.85);
  for (const s of sats) lineSeg(ctx, x, y, s.x, s.y);

  stroke(ctx, c, 0.4, 0.55);
  ctx.beginPath();
  ctx.moveTo(sats[0].x, sats[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(sats[i].x, sats[i].y);
  ctx.closePath();
  ctx.stroke();

  const erx = r * 0.23;
  const ery = r * 0.15;
  for (const [deg, alpha] of [[35, 0.55], [75, 0.45], [115, 0.4]] as const) {
    ctx.save();
    stroke(ctx, c, 0.4, alpha);
    ctx.translate(x, y);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.beginPath();
    ctx.ellipse(0, 0, erx, ery, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  fill(ctx, "#FFF4D6", 0.95);
  dot(ctx, x, y, r * 0.13);
  fill(ctx, "#FFFFFF", 1);
  dot(ctx, x, y, r * 0.058);

  fill(ctx, c, 0.95);
  for (const s of sats) dot(ctx, s.x, s.y, r * 0.053);

  ctx.globalAlpha = 1;
};

// ─── BNT-CNN (Rsvg=28): 3 stacked CNN layer slabs + output dots ─────────
const cnn_stack: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 28;
  const rect = (ox: number, oy: number, w: number, h: number) =>
    ctx.strokeRect(x + ox * s, y + oy * s, w * s, h * s);

  stroke(ctx, c, 0.7, 0.9);
  rect(-16, -12, 7, 24);
  rect(-5, -8, 6, 16);
  rect(5, -5, 5, 10);

  stroke(ctx, c, 0.5, 0.8);
  lineSeg(ctx, x + -9 * s, y, x + -5 * s, y);
  lineSeg(ctx, x + 1 * s, y, x + 5 * s, y);
  lineSeg(ctx, x + 10 * s, y, x + 14 * s, y);

  fill(ctx, "#FFF4D6", 1);
  dot(ctx, x + 16 * s, y - 3 * s, 1.4 * s);
  dot(ctx, x + 16 * s, y + 3 * s, 1.4 * s);
  ctx.globalAlpha = 1;
};

// ─── Wavelet l1-norm (Rsvg=30): recursively subdivided square ──────────
const wavelet_quadtree: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 30;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  // Outer square
  stroke(ctx, c, 0.85, 0.95);
  ctx.strokeRect(X(-18), Y(-18), 36 * s, 36 * s);
  // Main split (vertical + horizontal through center)
  stroke(ctx, c, 0.7, 0.9);
  lineSeg(ctx, X(0), Y(-18), X(0), Y(18));
  lineSeg(ctx, X(-18), Y(0), X(18), Y(0));
  // TL quadrant subdivided
  stroke(ctx, c, 0.55, 0.8);
  lineSeg(ctx, X(-9), Y(-18), X(-9), Y(0));
  lineSeg(ctx, X(-18), Y(-9), X(0), Y(-9));
  // TL of TL further subdivided
  stroke(ctx, c, 0.4, 0.7);
  lineSeg(ctx, X(-14), Y(-18), X(-14), Y(-9));
  lineSeg(ctx, X(-18), Y(-14), X(-9), Y(-14));
  // Highlighted leaf in NW corner (approximation coefficients)
  fill(ctx, c, 0.55);
  ctx.fillRect(X(-18), Y(-18), 4 * s, 4 * s);
  // Highlighted leaf in SE quadrant (detail coefficients)
  fill(ctx, "#E8A23D", 0.3);
  ctx.fillRect(X(0), Y(0), 9 * s, 9 * s);
  ctx.globalAlpha = 1;
};

// ─── Opt. transport (Rsvg=24): two rows of 4 dots + S-curves ────────────
const transport_plan: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 24;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  fill(ctx, c, 1);
  for (const ox of [-14, -6, 6, 14]) {
    dot(ctx, X(ox), Y(-10), 1.6 * s);
    dot(ctx, X(ox), Y(10), 1.6 * s);
  }

  stroke(ctx, c, 0.5, 0.9);
  // S-curve: top-i to bottom-(i swapped within pair). Pairs: (-14, -6) cross, (6, 14) cross.
  const curves: [number, number, number, number][] = [
    [-14, -8, -6, 8],
    [-6, -8, -14, 8],
    [6, -8, 14, 8],
    [14, -8, 6, 8],
  ];
  for (const [x1, y1, x2, y2] of curves) {
    ctx.beginPath();
    ctx.moveTo(X(x1), Y(y1));
    ctx.quadraticCurveTo(X((x1 + x2) / 2 - (x2 - x1) * 0.3), Y(0), X(x2), Y(y2));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

// ─── DL mass mapping (Rsvg=26): input grid → CNN cell → output grid ─────
const input_cnn_output: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 26;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  // Input grid (3x3 within 12x12 box at (-18, -8))
  stroke(ctx, c, 0.55, 0.9);
  ctx.strokeRect(X(-18), Y(-8), 12 * s, 12 * s);
  stroke(ctx, c, 0.3, 0.6);
  lineSeg(ctx, X(-14), Y(-8), X(-14), Y(4));
  lineSeg(ctx, X(-10), Y(-8), X(-10), Y(4));
  lineSeg(ctx, X(-18), Y(-4), X(-6), Y(-4));
  lineSeg(ctx, X(-18), Y(0), X(-6), Y(0));

  // CNN preview cell
  fill(ctx, "#E8A23D", 0.55);
  ctx.fillRect(X(-4), Y(-5), 6 * s, 6 * s);
  stroke(ctx, c, 0.4, 0.9);
  ctx.strokeRect(X(-4), Y(-5), 6 * s, 6 * s);

  // Connectors
  stroke(ctx, c, 0.5, 0.95);
  lineSeg(ctx, X(-6), Y(-2), X(-4), Y(-2));
  lineSeg(ctx, X(2), Y(-2), X(4), Y(-2));

  // Output grid
  stroke(ctx, c, 0.55, 0.9);
  ctx.strokeRect(X(4), Y(-8), 12 * s, 12 * s);
  stroke(ctx, c, 0.3, 0.6);
  lineSeg(ctx, X(8), Y(-8), X(8), Y(4));
  lineSeg(ctx, X(12), Y(-8), X(12), Y(4));
  lineSeg(ctx, X(4), Y(-4), X(16), Y(-4));
  lineSeg(ctx, X(4), Y(0), X(16), Y(0));

  // 2 highlighted output cells
  fill(ctx, "#FFF4D6", 0.95);
  ctx.fillRect(X(8), Y(-4), 4 * s, 4 * s);
  fill(ctx, c, 0.6);
  ctx.fillRect(X(12), Y(-4), 4 * s, 4 * s);
  ctx.globalAlpha = 1;
};

// ─── Wavelet benchmarks (Rsvg=28): 3x3 method-comparison grid ───────────
const method_grid_3x3: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 28;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  stroke(ctx, c, 0.5, 0.75);
  ctx.strokeRect(X(-15), Y(-15), 30 * s, 30 * s);
  stroke(ctx, c, 0.4, 0.65);
  lineSeg(ctx, X(-5), Y(-15), X(-5), Y(15));
  lineSeg(ctx, X(5), Y(-15), X(5), Y(15));
  lineSeg(ctx, X(-15), Y(-5), X(15), Y(-5));
  lineSeg(ctx, X(-15), Y(5), X(15), Y(5));

  fill(ctx, c, 0.4);
  ctx.fillRect(X(-5), Y(-5), 10 * s, 10 * s);

  // Per-cell icons
  fill(ctx, c, 1);
  dot(ctx, X(-10), Y(-10), 1.4 * s);

  stroke(ctx, c, 0.5, 1);
  ctx.beginPath();
  ctx.moveTo(X(-3), Y(-8));
  ctx.lineTo(X(0), Y(-13));
  ctx.lineTo(X(3), Y(-8));
  ctx.stroke();

  stroke(ctx, c, 0.5, 1);
  ctx.strokeRect(X(8.5), Y(-12), 3.5 * s, 3.5 * s);

  fill(ctx, c, 1);
  dot(ctx, X(-10), Y(0), 1 * s);
  fill(ctx, "#FFF4D6", 1);
  dot(ctx, X(0), Y(0), 1.7 * s);
  fill(ctx, c, 1);
  dot(ctx, X(10), Y(0), 1 * s);

  stroke(ctx, c, 0.5, 1);
  ctx.beginPath();
  ctx.moveTo(X(-12), Y(12));
  ctx.lineTo(X(-10), Y(8));
  ctx.lineTo(X(-8), Y(12));
  ctx.stroke();

  lineSeg(ctx, X(-3), Y(8), X(-3), Y(12));
  lineSeg(ctx, X(3), Y(8), X(3), Y(12));

  lineSeg(ctx, X(8), Y(9), X(12), Y(9));
  lineSeg(ctx, X(8), Y(12), X(12), Y(12));
  ctx.globalAlpha = 1;
};

// ─── Mass-map uncertainty (Rsvg=28): nested rotated contours + samples ──
const posterior_contours: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 28;
  const ang = (22 * Math.PI) / 180;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  stroke(ctx, c, 0.5, 0.7);
  ctx.beginPath();
  ctx.ellipse(0, 0, 18 * s, 11 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  stroke(ctx, c, 0.65, 0.9);
  ctx.beginPath();
  ctx.ellipse(0, 0, 12 * s, 7 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  fill(ctx, "#FFF4D6", 0.95);
  ctx.beginPath();
  ctx.ellipse(0, 0, 5.5 * s, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const samples: [number, number, number, number][] = [
    [-8, -7, 0.9, 0.85],
    [7, -6, 0.9, 0.85],
    [10, 5, 0.9, 0.85],
    [-8, 8, 0.9, 0.85],
    [-14, -2, 0.7, 0.7],
    [14, 1, 0.7, 0.7],
    [-4, -13, 0.6, 0.6],
    [1, 13, 0.7, 0.65],
    [-16, 6, 0.55, 0.55],
  ];
  for (const [ox, oy, dr, alpha] of samples) {
    fill(ctx, c, alpha);
    dot(ctx, x + ox * s, y + oy * s, dr * s);
  }
  ctx.globalAlpha = 1;
};

// ─── l1 emulator (Rsvg=22): 3-2-1 MLP ───────────────────────────────────
const mlp_small: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 22;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  // Input → hidden edges
  stroke(ctx, c, 0.3, 0.7);
  for (const iy of [-8, 0, 8]) {
    lineSeg(ctx, X(-12), Y(iy), X(0), Y(-4));
    lineSeg(ctx, X(-12), Y(iy), X(0), Y(4));
  }
  // Hidden → output edges (highlighted)
  stroke(ctx, "#FFF4D6", 0.5, 0.95);
  lineSeg(ctx, X(0), Y(-4), X(12), Y(0));
  lineSeg(ctx, X(0), Y(4), X(12), Y(0));

  fill(ctx, c, 1);
  for (const iy of [-8, 0, 8]) dot(ctx, X(-12), Y(iy), 1.6 * s);
  for (const my of [-4, 4]) dot(ctx, X(0), Y(my), 1.6 * s);
  fill(ctx, "#FFF4D6", 1);
  dot(ctx, X(12), Y(0), 2.2 * s);
  ctx.globalAlpha = 1;
};

// ─── Euclid · HOWLS (Rsvg=36): 4x4 sky patch with sheared galaxies ──────
const survey_patch: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 36;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  stroke(ctx, c, 0.6, 0.75);
  ctx.strokeRect(X(-22), Y(-22), 44 * s, 44 * s);
  stroke(ctx, c, 0.3, 0.5);
  for (const o of [-11, 0, 11]) {
    lineSeg(ctx, X(o), Y(-22), X(o), Y(22));
    lineSeg(ctx, X(-22), Y(o), X(22), Y(o));
  }

  // Sheared galaxy ellipses
  const galaxies: [number, number, number, number, number][] = [
    [-7, -5, 2.4, 1, 30],
    [7, 5, 2.4, 1, -25],
    [-3, 15, 2.2, 0.9, 60],
    [15, -5, 2.2, 0.9, 45],
    [-15, 5, 2, 0.8, -50],
    [10, 15, 2.2, 0.9, 20],
    [-15, -15, 2, 0.8, 70],
    [15, -15, 2, 0.8, -10],
  ];
  for (const [ox, oy, rx, ry, deg] of galaxies) {
    ctx.save();
    stroke(ctx, "#FFF4D6", 0.5, 0.95);
    ctx.translate(X(ox), Y(oy));
    ctx.rotate((deg * Math.PI) / 180);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * s, ry * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
};

// ─── Thesis defense (Rsvg=24): speaker + podium + panel + Q&A arrows ────
const podium_panel: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 24;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  fill(ctx, "#E6F8FB", 1);
  dot(ctx, X(0), Y(-8), 1.9 * s);
  stroke(ctx, "#A8DAE0", 0.6, 0.95);
  lineSeg(ctx, X(0), Y(-6), X(0), Y(4));
  stroke(ctx, "#A8DAE0", 0.5, 0.9);
  ctx.strokeRect(X(-3), Y(4), 6 * s, 6 * s);

  fill(ctx, "#A8DAE0", 0.95);
  for (const ox of [-13, -6, 6, 13]) dot(ctx, X(ox), Y(15), 1.3 * s);

  stroke(ctx, "#E6F8FB", 0.4, 0.8);
  lineSeg(ctx, X(-11), Y(12), X(-4), Y(6));
  lineSeg(ctx, X(11), Y(12), X(4), Y(6));
  lineSeg(ctx, X(-3), Y(2), X(-8), Y(10));
  lineSeg(ctx, X(3), Y(2), X(8), Y(10));
  ctx.globalAlpha = 1;
};

// ─── Postdoc · UVa (Rsvg=42): the literal Rotunda ───────────────────────
const rotunda: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 42;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  stroke(ctx, "#E6F8FB", 0.9, 0.95);
  // Dome
  ctx.beginPath();
  ctx.arc(X(0), Y(0), 20 * s, Math.PI, 0);
  ctx.stroke();
  // Finial spire + top knob
  stroke(ctx, "#E6F8FB", 0.6, 0.9);
  lineSeg(ctx, X(0), Y(-20), X(0), Y(-25));
  fill(ctx, "#E6F8FB", 1);
  dot(ctx, X(0), Y(-27), 1.5 * s);
  // Entablature (two parallel lines)
  stroke(ctx, "#E6F8FB", 0.7, 0.95);
  lineSeg(ctx, X(-20), Y(0), X(20), Y(0));
  stroke(ctx, "#A8DAE0", 0.5, 0.8);
  lineSeg(ctx, X(-23), Y(3), X(23), Y(3));
  // Columns
  stroke(ctx, "#E6F8FB", 0.85, 0.95);
  for (const ox of [-16, -6, 6, 16]) lineSeg(ctx, X(ox), Y(3), X(ox), Y(25));
  // Base
  stroke(ctx, "#E6F8FB", 0.8, 0.95);
  lineSeg(ctx, X(-23), Y(25), X(23), Y(25));
  stroke(ctx, "#A8DAE0", 0.5, 0.8);
  lineSeg(ctx, X(-25), Y(28), X(25), Y(28));
  ctx.globalAlpha = 1;
};

// ─── CCA · NY trip (Rsvg=24): two pins + dashed flight arc + plane ──────
const pins_flight_arc: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 24;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  // Dashed arc
  ctx.save();
  stroke(ctx, "#E6F8FB", 0.6, 0.95);
  ctx.setLineDash([2, 1.5]);
  ctx.beginPath();
  ctx.moveTo(X(-13), Y(8));
  ctx.quadraticCurveTo(X(0), Y(-15), X(13), Y(-7));
  ctx.stroke();
  ctx.restore();

  // Departure pin (dimmer)
  fill(ctx, "#A8DAE0", 1);
  dot(ctx, X(-13), Y(8), 2.4 * s);
  stroke(ctx, "#A8DAE0", 0.7, 1);
  lineSeg(ctx, X(-13), Y(10), X(-13), Y(14));

  // Arrival pin (brighter)
  fill(ctx, "#E6F8FB", 1);
  dot(ctx, X(13), Y(-7), 2.4 * s);
  stroke(ctx, "#E6F8FB", 0.7, 1);
  lineSeg(ctx, X(13), Y(-5), X(13), Y(-1));

  // Tiny plane glyph
  stroke(ctx, "#E6F8FB", 0.6, 0.95);
  ctx.beginPath();
  ctx.moveTo(X(-2), Y(-8));
  ctx.lineTo(X(3), Y(-8));
  ctx.lineTo(X(1), Y(-11));
  ctx.moveTo(X(3), Y(-8));
  ctx.lineTo(X(1), Y(-5));
  ctx.stroke();
  ctx.globalAlpha = 1;
};

// ─── Personal site (Rsvg=22): browser window with controls + lines ──────
const browser_window: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 22;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  stroke(ctx, "#E8D6F4", 0.7, 0.95);
  // rounded rect (approx with strokeRect since rx is small)
  ctx.strokeRect(X(-14), Y(-12), 28 * s, 22 * s);
  stroke(ctx, "#E8D6F4", 0.5, 0.85);
  lineSeg(ctx, X(-14), Y(-6), X(14), Y(-6));

  fill(ctx, "#E8D6F4", 0.95);
  dot(ctx, X(-11), Y(-9), 0.9 * s);
  dot(ctx, X(-7), Y(-9), 0.9 * s);
  dot(ctx, X(-3), Y(-9), 0.9 * s);

  stroke(ctx, "#C5A8DC", 0.5, 0.85);
  lineSeg(ctx, X(-11), Y(-2), X(10), Y(-2));
  lineSeg(ctx, X(-11), Y(1), X(5), Y(1));
  lineSeg(ctx, X(-11), Y(4), X(7), Y(4));
  lineSeg(ctx, X(-11), Y(7), X(0), Y(7));
  ctx.globalAlpha = 1;
};

// ─── Claude infrastructure (Rsvg=32): 3-level node tree ─────────────────
const node_tree: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 32;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  stroke(ctx, "#E8D6F4", 0.5, 0.9);
  // Root → mid edges (start at root y=-16, go to mid y=-4)
  lineSeg(ctx, X(0), Y(-16), X(-15), Y(-4));
  lineSeg(ctx, X(0), Y(-16), X(0), Y(-4));
  lineSeg(ctx, X(0), Y(-16), X(15), Y(-4));
  // Mid → leaf edges (start at mid y=0, go to leaf y=12)
  lineSeg(ctx, X(-15), Y(0), X(-21), Y(12));
  lineSeg(ctx, X(-15), Y(0), X(-9), Y(12));
  lineSeg(ctx, X(0), Y(0), X(0), Y(12));
  lineSeg(ctx, X(15), Y(0), X(9), Y(12));
  lineSeg(ctx, X(15), Y(0), X(21), Y(12));

  // Cross-connections (dashed) between adjacent leaves
  ctx.save();
  stroke(ctx, "#C5A8DC", 0.35, 0.65);
  ctx.setLineDash([1, 1]);
  lineSeg(ctx, X(-9), Y(14), X(0), Y(14));
  lineSeg(ctx, X(0), Y(14), X(9), Y(14));
  ctx.restore();

  // Root (white)
  fill(ctx, "#FFFFFF", 1);
  dot(ctx, X(0), Y(-18), 3 * s);
  // Mid nodes
  fill(ctx, "#E8D6F4", 1);
  for (const ox of [-15, 0, 15]) dot(ctx, X(ox), Y(-2), 2.2 * s);
  // Leaf nodes
  fill(ctx, "#C5A8DC", 1);
  for (const ox of [-21, -9, 0, 9, 21]) dot(ctx, X(ox), Y(14), 1.6 * s);
  ctx.globalAlpha = 1;
};

// ─── Claude · arxiv (Rsvg=22): paper with corner fold + highlight band ──
const paper_highlight: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 22;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  // Outline
  stroke(ctx, "#E8D6F4", 0.7, 0.95);
  ctx.beginPath();
  ctx.moveTo(X(-9), Y(-12));
  ctx.lineTo(X(6), Y(-12));
  ctx.lineTo(X(11), Y(-7));
  ctx.lineTo(X(11), Y(12));
  ctx.lineTo(X(-9), Y(12));
  ctx.closePath();
  ctx.stroke();
  // Corner fold
  stroke(ctx, "#E8D6F4", 0.5, 0.85);
  ctx.beginPath();
  ctx.moveTo(X(6), Y(-12));
  ctx.lineTo(X(6), Y(-7));
  ctx.lineTo(X(11), Y(-7));
  ctx.stroke();
  // Highlight band
  fill(ctx, "#E8D6F4", 0.4);
  ctx.fillRect(X(-7), Y(3), 15 * s, 3 * s);
  // Main text lines
  stroke(ctx, "#C5A8DC", 0.5, 0.95);
  lineSeg(ctx, X(-7), Y(-6), X(3), Y(-6));
  lineSeg(ctx, X(-7), Y(-2), X(8), Y(-2));
  lineSeg(ctx, X(-7), Y(1), X(8), Y(1));
  // Lower text lines
  stroke(ctx, "#C5A8DC", 0.4, 0.8);
  lineSeg(ctx, X(-7), Y(4), X(8), Y(4));
  lineSeg(ctx, X(-7), Y(7), X(5), Y(7));
  lineSeg(ctx, X(-7), Y(10), X(8), Y(10));
  ctx.globalAlpha = 1;
};

// ─── AstroStat (Rsvg=36): instructor + podium + lecture-hall seats ──────
const classroom_seating: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 36;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  // Podium
  stroke(ctx, "#D5EED5", 0.6, 0.95);
  ctx.strokeRect(X(-4), Y(-19), 8 * s, 6 * s);
  stroke(ctx, "#D5EED5", 0.4, 0.85);
  lineSeg(ctx, X(-4), Y(-17), X(4), Y(-17));
  // Instructor
  fill(ctx, "#FFFFFF", 1);
  dot(ctx, X(0), Y(-23), 2 * s);
  // Seat rows — centered symmetrically around x=0 (the v8 SVG seats are
  // biased right; the user noticed the asymmetry).
  fill(ctx, "#A8D8A8", 0.95);
  const rows: [number, number[]][] = [
    [-4, [-15, -9, -3, 3, 9, 15]],
    [4, [-18, -12, -6, 0, 6, 12, 18]],
    [12, [-21, -15, -9, -3, 3, 9, 15, 21]],
    [20, [-24, -18, -12, -6, 0, 6, 12, 18, 24]],
  ];
  for (const [ry, xs] of rows) for (const ox of xs) dot(ctx, X(ox), Y(ry), 1.4 * s);
  ctx.globalAlpha = 1;
};

// ─── 3MT (Rsvg=22): stopwatch face, hand at 3 ───────────────────────────
const stopwatch_3min: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 22;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  // Crown
  fill(ctx, "#C49B5B", 0.9);
  ctx.fillRect(X(-2), Y(-18), 4 * s, 3 * s);
  stroke(ctx, "#C49B5B", 0.6, 0.85);
  lineSeg(ctx, X(-1), Y(-20), X(1), Y(-20));
  // Face
  stroke(ctx, "#F0DAA8", 0.8, 0.95);
  ctx.beginPath();
  ctx.arc(X(0), Y(0), 13 * s, 0, Math.PI * 2);
  ctx.stroke();
  // Cardinal ticks (12, 3, 6, 9)
  stroke(ctx, "#F0DAA8", 0.5, 0.95);
  lineSeg(ctx, X(0), Y(-12), X(0), Y(-10));
  lineSeg(ctx, X(12), Y(0), X(10), Y(0));
  lineSeg(ctx, X(0), Y(12), X(0), Y(10));
  lineSeg(ctx, X(-12), Y(0), X(-10), Y(0));
  // Minute hand to 3-ish
  stroke(ctx, "#F0DAA8", 0.9, 1);
  lineSeg(ctx, X(0), Y(0), X(9), Y(-6));
  // Second hand pointing up
  stroke(ctx, "#C49B5B", 0.6, 0.85);
  lineSeg(ctx, X(0), Y(0), X(0), Y(-10));
  // Center pin
  fill(ctx, "#F0DAA8", 1);
  dot(ctx, X(0), Y(0), 1.4 * s);
  // Tiny "3" label
  fill(ctx, "#F0DAA8", 0.95);
  ctx.font = `${5 * s}px ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("3", X(13), Y(-5));
  ctx.globalAlpha = 1;
};

// ─── Padlock (Rsvg=24): rounded body + shackle + keyhole ────────────────
const padlock: GlyphFn = (ctx, x, y, r, c) => {
  const s = r / 24;
  const X = (o: number) => x + o * s;
  const Y = (o: number) => y + o * s;

  stroke(ctx, "#9C9CA8", 0.8, 0.9);
  // Body (rounded rect approximation)
  const bx = X(-8);
  const by = Y(-1);
  const bw = 16 * s;
  const bh = 12 * s;
  const rd = 1.5 * s;
  ctx.beginPath();
  ctx.moveTo(bx + rd, by);
  ctx.lineTo(bx + bw - rd, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + rd);
  ctx.lineTo(bx + bw, by + bh - rd);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - rd, by + bh);
  ctx.lineTo(bx + rd, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - rd);
  ctx.lineTo(bx, by + rd);
  ctx.quadraticCurveTo(bx, by, bx + rd, by);
  ctx.closePath();
  ctx.stroke();
  // Shackle
  ctx.beginPath();
  ctx.moveTo(X(-4), Y(-1));
  ctx.lineTo(X(-4), Y(-7));
  ctx.arc(X(0), Y(-7), 4 * s, Math.PI, 0);
  ctx.lineTo(X(4), Y(-1));
  ctx.stroke();
  // Keyhole
  stroke(ctx, "#9C9CA8", 0.5, 0.9);
  ctx.beginPath();
  ctx.arc(X(0), Y(4), 1.3 * s, 0, Math.PI * 2);
  ctx.stroke();
  lineSeg(ctx, X(0), Y(5), X(0), Y(8));
  ctx.globalAlpha = 1;
};

const GLYPHS: Record<GlyphType, GlyphFn> = {
  thesis_dag_lens,
  cnn_stack,
  wavelet_quadtree,
  transport_plan,
  input_cnn_output,
  method_grid_3x3,
  posterior_contours,
  mlp_small,
  survey_patch,
  podium_panel,
  rotunda,
  pins_flight_arc,
  browser_window,
  node_tree,
  paper_highlight,
  classroom_seating,
  stopwatch_3min,
  padlock,
};

export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  type: GlyphType,
  x: number,
  y: number,
  r: number,
  color: string
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  GLYPHS[type](ctx, x, y, r, color);
  ctx.restore();
}
