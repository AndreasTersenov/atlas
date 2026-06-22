// Section scaffolding for the three BNT engines.
//
// Each component renders exactly the DOM the corresponding engine's
// constructor queries for. Mirrored from index_parked_bnt_preview.html
// in the talks repo so the engines see the DOM shape they were written
// against. Used as the `sectionContent` prop of <RevealExplainer>.
//
// Extracted out of inline JSX per G1c3a_PR_REVIEW.md §7.1 (S3): each
// scaffolding is ~30–50 lines, and three of them inline in bnt-cnn.mdx
// would be ~130 lines of wire-harness vs content. Components are pure
// presentational — no state, no props — so they're cheap to use.
//
// Extending the BNT explainer: if Andreas adds new engines upstream
// (e.g. a fourth `data-bnt-kind`), mirror the section markup from the
// talks repo into a new component here.

import type { ReactElement } from "react";

/**
 * Cloud engine (default `kind`). Engine queries:
 *   - canvas.bnt-cloud   (main animated canvas)
 *   - canvas.bnt-kernels (lensing-kernel inset)
 *   - .bnt-meter         (FoM3 meter; engine writes innerHTML)
 *   - .bnt-caption       (per-act caption; engine writes innerHTML)
 *   - .bnt-kernels-caption (kernel inset caption)
 */
export function BNTCloudSection(): ReactElement {
  return (
    <>
      <div className="bnt-stage">
        <div className="bnt-main">
          <canvas
            className="bnt-cloud"
            width={1520}
            height={1200}
            aria-label="A fixed point cloud of map pixels with rotating measuring axes and their 1-D projections"
          />
          <div className="bnt-cloud-tag">
            the point cloud (all the information) never moves
          </div>
        </div>
        <div className="bnt-side">
          <div className="bnt-meter" aria-label="FoM3 meter" />
          <div className="bnt-kernels-wrap">
            <div className="bnt-kernels-title">lensing kernels q(z)</div>
            <canvas
              className="bnt-kernels"
              width={640}
              height={360}
              aria-label="Lensing efficiency kernels morphing from deep overlapping to one shallow map plus three thin lens-redshift slices"
            />
            <div className="bnt-kernels-caption" />
          </div>
        </div>
      </div>
      <div className="bnt-caption" aria-live="polite" />
      <button
        className="bnt-replay"
        type="button"
        title="Replay the sequence (R)"
      >
        ↻&nbsp;replay
      </button>
    </>
  );
}

/**
 * Mechanism engine (`kind="mechanism"`). Engine queries:
 *   - canvas.bnt-mech-lines  (signal+noise lines animation)
 *   - canvas.bnt-mech-cov    (covariance inset)
 *   - .bnt-meter.bnt-mech-ladder (recovery ladder; engine writes innerHTML)
 *   - .bnt-caption           (per-act caption)
 *   - .bnt-kernels-caption.bnt-mech-cov-cap (covariance caption)
 */
export function BNTMechanismSection(): ReactElement {
  return (
    <>
      <div className="bnt-stage">
        <div className="bnt-main">
          <canvas
            className="bnt-mech-lines"
            width={1520}
            height={1100}
            aria-label="Four tomographic map tiles sharing one common signal, then BNT differences them into a shallow map plus thin slices with amplified correlated noise; the CNN reconstructs the common signal"
          />
        </div>
        <div className="bnt-side">
          <div
            className="bnt-meter bnt-mech-ladder"
            aria-label="recovery ladder"
          />
          <div className="bnt-kernels-wrap">
            <div className="bnt-kernels-title">noise covariance</div>
            <canvas
              className="bnt-mech-cov"
              width={320}
              height={320}
              aria-label="Noise covariance: identity (white) morphing to B B-transpose (amplified, correlated)"
            />
            <div className="bnt-kernels-caption bnt-mech-cov-cap" />
          </div>
        </div>
      </div>
      <div className="bnt-caption" aria-live="polite" />
      <button
        className="bnt-replay"
        type="button"
        title="Replay the sequence (R)"
      >
        ↻&nbsp;replay
      </button>
    </>
  );
}

/**
 * Two-point engine (`kind="twopoint"`). Engine queries:
 *   - canvas.bnt-tp-canvas   (the auto+cross spectrum-matrix animation)
 *   - .bnt-caption           (per-act caption)
 *
 * Uses `.bnt-stage--wide` because the canvas is 2200×1040 — wider than
 * the cloud/mechanism stages.
 */
export function BNTTwoPointSection(): ReactElement {
  return (
    <>
      <div className="bnt-stage bnt-stage--wide">
        <div className="bnt-main">
          <canvas
            className="bnt-tp-canvas"
            width={2200}
            height={1040}
            aria-label="The auto+cross spectrum matrix C transforms invertibly as B C B-transpose, so it is exactly recoverable; keeping only the diagonal (auto-only) cannot be inverted back"
          />
        </div>
      </div>
      <div className="bnt-caption" aria-live="polite" />
      <button
        className="bnt-replay"
        type="button"
        title="Replay the sequence (R)"
      >
        ↻&nbsp;replay
      </button>
    </>
  );
}
