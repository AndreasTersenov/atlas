import type { Domain, Junction, Status } from "./types";

export const VIEW_W = 730;
export const VIEW_H = 640;

export const BG = "#1A0828";

// Bumped alphas (~+50%) so each domain region reads at a glance.
// Saturated the hues a touch where the original tints were muddy.
export const NEBULA: Record<Domain, { color: string; alpha: number }> = {
  research: { color: "#6E1838", alpha: 0.78 },
  career: { color: "#3F2570", alpha: 0.7 },
  infrastructure: { color: "#4F1E68", alpha: 0.78 },
  teaching: { color: "#2F4530", alpha: 0.62 },
  personal: { color: "#4A1838", alpha: 0.6 },
  bronze: { color: "#4A2A1A", alpha: 0.5 },
};

export const NEBULA_REGIONS: Array<{
  domain: Domain;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}> = [
  { domain: "research", cx: 280, cy: 340, rx: 290, ry: 230 },
  { domain: "career", cx: 585, cy: 245, rx: 135, ry: 220 },
  { domain: "infrastructure", cx: 220, cy: 80, rx: 260, ry: 80 },
  { domain: "teaching", cx: 530, cy: 465, rx: 135, ry: 70 },
  { domain: "personal", cx: 280, cy: 555, rx: 290, ry: 75 },
];

export interface HaloPalette {
  haze: { offset: number; color: string; alpha: number }[];
  outline: string;
  glyph: string;
  nameColor: string;
}

export const HALO_PALETTE: Record<Domain, HaloPalette> = {
  research: {
    haze: [
      { offset: 0, color: "#FFEDC0", alpha: 0.55 },
      { offset: 0.35, color: "#E8A23D", alpha: 0.25 },
      { offset: 1, color: "#E8A23D", alpha: 0 },
    ],
    outline: "#FFD176",
    glyph: "#FFD89B",
    nameColor: "#FFE7B5",
  },
  career: {
    haze: [
      { offset: 0, color: "#E6F8FB", alpha: 0.55 },
      { offset: 0.3, color: "#7FD0DC", alpha: 0.3 },
      { offset: 1, color: "#5BB8C4", alpha: 0 },
    ],
    outline: "#7FD0DC",
    glyph: "#A8DAE0",
    nameColor: "#E6F8FB",
  },
  infrastructure: {
    haze: [
      { offset: 0, color: "#E8D6F4", alpha: 0.5 },
      { offset: 0.35, color: "#9B6BC4", alpha: 0.25 },
      { offset: 1, color: "#9B6BC4", alpha: 0 },
    ],
    outline: "#C5A8DC",
    glyph: "#E8D6F4",
    nameColor: "#D4BCE6",
  },
  teaching: {
    haze: [
      { offset: 0, color: "#D5EED5", alpha: 0.5 },
      { offset: 0.35, color: "#6FA86F", alpha: 0.25 },
      { offset: 1, color: "#6FA86F", alpha: 0 },
    ],
    outline: "#A8D8A8",
    glyph: "#D5EED5",
    nameColor: "#D5EED5",
  },
  bronze: {
    haze: [
      { offset: 0, color: "#F0DAA8", alpha: 0.5 },
      { offset: 0.35, color: "#C49B5B", alpha: 0.25 },
      { offset: 1, color: "#C49B5B", alpha: 0 },
    ],
    outline: "#F0DAA8",
    glyph: "#F0DAA8",
    nameColor: "#F0DAA8",
  },
  personal: {
    haze: [
      { offset: 0, color: "#B8B8C0", alpha: 0.4 },
      { offset: 1, color: "#7A7A82", alpha: 0 },
    ],
    outline: "#9C9CA8",
    glyph: "#9C9CA8",
    nameColor: "#9C9CA8",
  },
};

export interface MatterStop {
  offset: number;
  color: string;
  alpha: number;
}

export const MATTER_BRIGHT: MatterStop[] = [
  { offset: 0, color: "#FFE0A8", alpha: 0.95 },
  { offset: 0.45, color: "#FFA068", alpha: 0.5 },
  { offset: 1, color: "#C04880", alpha: 0 },
];

export const MATTER_WARM: MatterStop[] = [
  { offset: 0, color: "#FFC088", alpha: 0.7 },
  { offset: 0.5, color: "#D06090", alpha: 0.32 },
  { offset: 1, color: "#702060", alpha: 0 },
];

export const MATTER_DIM: MatterStop[] = [
  { offset: 0, color: "#D080A8", alpha: 0.55 },
  { offset: 0.55, color: "#8040A0", alpha: 0.22 },
  { offset: 1, color: "#40208A", alpha: 0 },
];

export const KNOT: MatterStop[] = [
  { offset: 0, color: "#FFE8B0", alpha: 1 },
  { offset: 0.4, color: "#FFB070", alpha: 0.65 },
  { offset: 1, color: "#E04880", alpha: 0 },
];

export const JUNCTION: MatterStop[] = [
  { offset: 0, color: "#FFFFFF", alpha: 0.95 },
  { offset: 0.25, color: "#FFEDC0", alpha: 0.7 },
  { offset: 0.6, color: "#FF8870", alpha: 0.25 },
  { offset: 1, color: "#E04880", alpha: 0 },
];

export const PARTICLE_LAYERS: { color: string; alpha: number; size: number; count: number; seed: number }[] = [
  { color: "#7A2C70", alpha: 0.6, size: 0.45, count: 280, seed: 11 },
  { color: "#C460A0", alpha: 0.8, size: 0.55, count: 200, seed: 22 },
  { color: "#FFC880", alpha: 0.95, size: 0.85, count: 80, seed: 33 },
];

export const NAMED_JUNCTIONS: Junction[] = [
  { id: "wavelet-hub", x: 337, y: 263, intensity: 1 },
  { id: "dl-hub", x: 371, y: 405, intensity: 1 },
];

// Panel chrome accents used on /p/[haloId] (v2 per-halo project pages, when
// they land) and on any halo-status pill elsewhere. Co-located with the map
// palette so a future domain/status addition updates both surfaces from one
// place. Derived from HALO_PALETTE but tuned for muted pill backgrounds
// (HALO_PALETTE entries are gradient stops, not flat solids).
export interface PanelAccent {
  bg: string;
  text: string;
  ring: string;
}

export const PANEL_DOMAIN_ACCENT: Record<Domain, PanelAccent> = {
  research: { bg: "#3A1820", text: "#FFE7B5", ring: "#E8A23D" },
  career: { bg: "#1A3540", text: "#A8DAE0", ring: "#5BB8C4" },
  infrastructure: { bg: "#2A1842", text: "#E8D6F4", ring: "#9B6BC4" },
  teaching: { bg: "#1E3520", text: "#D5EED5", ring: "#6FA86F" },
  bronze: { bg: "#3A2818", text: "#F0DAA8", ring: "#C49B5B" },
  personal: { bg: "#1F1F25", text: "#9C9CA8", ring: "#7A7A82" },
};

export const PANEL_STATUS_ACCENT: Record<Status, Omit<PanelAccent, "ring">> = {
  active: { bg: "#1E3520", text: "#A8D8A8" },
  dormant: { bg: "#2A1842", text: "#C5A8DC" },
  locked: { bg: "#1F1F25", text: "#9C9CA8" },
  completed: { bg: "#1A3540", text: "#A8DAE0" },
};
