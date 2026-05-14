export type Domain =
  | "research"
  | "career"
  | "infrastructure"
  | "teaching"
  | "personal"
  | "bronze";

export type Status = "active" | "dormant" | "completed" | "locked";

export type Strength = "primary" | "medium" | "faint";

export type GlyphType =
  | "thesis_dag_lens"
  | "cnn_stack"
  | "wavelet_quadtree"
  | "transport_plan"
  | "input_cnn_output"
  | "method_grid_3x3"
  | "posterior_contours"
  | "mlp_small"
  | "survey_patch"
  | "podium_panel"
  | "rotunda"
  | "pins_flight_arc"
  | "browser_window"
  | "node_tree"
  | "paper_highlight"
  | "classroom_seating"
  | "stopwatch_3min"
  | "padlock";

export interface Halo {
  id: string;
  name: string;
  domain: Domain;
  description: string;
  description_long?: string;
  is_public: boolean;
  position_x: number;
  position_y: number;
  radius: number;
  glyph_type: GlyphType;
  status: Status;
}

export interface Filament {
  from_halo_id: string;
  to_halo_id: string;
  strength: Strength;
  kind: string;
  description?: string;
  via_junction?: string;
}

export interface Junction {
  id: string;
  x: number;
  y: number;
  intensity: number;
}
