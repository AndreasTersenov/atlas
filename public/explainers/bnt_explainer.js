/* ===========================================================================
 * BNT explainer — "shadows of a rotating cloud"
 * ---------------------------------------------------------------------------
 * One self-contained reveal.js slide that makes ONE effect intuitive:
 *
 *   Why does the BNT transform collapse the wavelet ell-1 norm's figure of
 *   merit (even with cross-maps) while leaving the CNN essentially lossless?
 *
 * The mechanism is the one proven in
 *   scripts/sbi/results/exploratory/flatsky_cross_2026_06/BNT_THEORY_DEEP_DIVE.md (§1)
 *   FLATSKY_BNT_RESULT.md
 * and summarised in HANDOFF_BNT_VIZ_TALK.md (§1 beats, §2 traps, §4 numbers).
 *
 * The picture (all five beats, in order):
 *   1. Four maps -> a fixed cloud of pixels in channel-space. A per-channel
 *      ell-1 is the cloud's SHADOW on one axis. The cloud is elongated along a
 *      "deep common mode" (the bins are deep, overlapping, redundant), so the
 *      original map axes both have a big projection on it -> rich shadows.
 *   2. BNT RE-ORIENTS the measuring axes off the long direction (it is an
 *      invertible *shear*, not a rotation -- the genuine rotation is the
 *      whitening Q). The new per-map axes point across the cloud, onto thin,
 *      signal-poor slices with amplified/correlated noise -> the shadows go
 *      blank. FoM3 falls to 0.26x. THE CLOUD ITSELF NEVER MOVES.
 *   3. The cosmology lives in the cloud's SHAPE -- the relations between maps.
 *      In this frame no single-map histogram can see it.
 *   4. The CNN mixes channels in its first layer, so it can draw its own axis
 *      back along the cloud (undo B for free) -> rich again, FoM3 ~ 0.96x.
 *      It is BASIS-ROBUST, not "smarter."
 *   5. Whitening rotates to a DIFFERENT clean frame -> the per-map shadows are
 *      rich again -> FoM3 recovers to 1.06x. Nothing was lost; the collapse
 *      was the BNT frame itself. (The irreducibly-joint share is ~ 0.)
 *
 * Traps avoided (HANDOFF §2): info is never destroyed (cloud fixed all acts);
 * the CNN is basis-robust, not stronger; the loss is a frame effect that
 * whitening fully reverses (NOT "irreducibly joint"); the lead cause is the
 * axes pointing onto signal-poor directions (geometry), with amplified noise
 * a secondary contributor -- not "noise washing out peaks."
 *
 * No build step, no external dependencies. Pure <canvas> + a little DOM, driven
 * by reveal's fragment events. Works dropped into any reveal.js deck.
 * ======================================================================== */
(function (global) {
  "use strict";

  /* ---- Locked palette (Wong, colourblind-safe; see TALK_BEST_PRACTICES.md) --
   * COLOUR encodes METHOD only: CNN = blue, L1 = vermillion. It never doubles
   * as a basis indicator. */
  var C_L1   = "#D55E00";   // ell-1 (wavelet)        -- Wong vermillion
  var C_CNN  = "#0072B2";   // CNN (VMIM)             -- Wong blue
  var C_INK  = "#1b2733";   // primary text / strokes
  var C_MUTE = "#7d8893";   // secondary
  var C_DEEP = "#1d6f5c";   // "deep common mode" guide (Wong-ish bluish green)
  var C_CLOUD = "#39516b";  // cloud points
  var C_PEAK  = "#d9a200";  // non-Gaussian peaks (rare high-kappa pixels)

  /* ---- Quantitative anchors (HANDOFF_BNT_VIZ_TALK.md §4) --------------------
   * Ratios are the arm-comparable headline (FoM3 is fragile -> ratio-led).
   * Absolute pairs are quoted only for the matched ell-1+product / CNN arms;
   * whitening is the L1-auto recovery ratio. */
  var FOM = {
    l1_nobnt_ratio: 1.00, l1_nobnt_abs: 3045,
    l1_bnt_ratio:   0.26, l1_bnt_abs:   779,    // 779/3045 = 0.256
    l1_whiten_ratio: 1.06,                      // L1-auto, M3
    cnn_nobnt_abs: 3326, cnn_bnt_ratio: 0.96, cnn_bnt_abs: 3186
  };

  /* ---- Toy geometry knobs (stylised; tuned to MATCH the proven behaviour) ---
   * Math convention: angles in degrees, y points UP (flipped at draw time).
   * The cloud's long "deep mode" sits at DEEP_DEG. */
  var DEEP_DEG = 45;        // cloud elongation direction
  var N_POINTS = 1300;
  var N_BINS   = 40;        // matches the pipeline's 40 SNR bins
  var HMIN = -3.0, HMAX = 4.6;   // fixed shadow-histogram range (scene units)
  var NOISE_SCALE = 0.30;        // base per-channel shape-noise std (scene units)

  var DEG = Math.PI / 180;

  /* Per-act target state. axes = the two per-map measuring axes (angle in deg,
   * n = shape-noise amplification of that channel). The collapse is driven by
   * BOTH small projection on the deep mode (axes ~ across the cloud) AND
   * amplified noise (n>1) -- exactly "signal-poor slice under amplified noise."
   * Whitening returns CLEAN noise (n=1) on a genuinely different orthogonal
   * frame; the CNN axis lies along the deep mode. */
  var ACTS = {
    1: { axes: [{ a:   0, n: 1.0 }, { a:  90, n: 1.0 }], cnn: 0, joint: 0.00, kmorph: 0,
         active: "l1" },
    2: { axes: [{ a: 118, n: 1.7 }, { a: 152, n: 1.8 }], cnn: 0, joint: 0.00, kmorph: 1,
         active: "l1" },
    3: { axes: [{ a: 118, n: 1.7 }, { a: 152, n: 1.8 }], cnn: 0, joint: 1.00, kmorph: 1,
         active: "l1" },
    4: { axes: [{ a: 118, n: 1.7 }, { a: 152, n: 1.8 }], cnn: 1, joint: 0.30, kmorph: 1,
         active: "cnn" },
    5: { axes: [{ a:  20, n: 1.0 }, { a: 110, n: 1.0 }], cnn: 0, joint: 0.00, kmorph: 1,
         active: "l1" }
  };
  var N_ACTS = 5;

  /* Captions + meter copy per act (talk-ready; concise). */
  var ACT_COPY = {
    1: { cap: "Each pixel is a point in 4-channel space; together the pixels form a " +
              "<b>point cloud</b>. The <span class='c-l1'>ℓ1-norm</span> of one map is its " +
              "<b>projection</b> onto that axis (a 1-D marginal). The cloud is elongated " +
              "along a <span class='c-deep'>deep common mode</span>, with a non-Gaussian tail of " +
              "<span class='c-peak'>rare high-κ peaks</span>, so both projections are <b>rich</b>.",
         ratio: "1.00×", abs: "FoM₃ 3045  ·  ℓ1 + product", marg: "" },
    2: { cap: "<b>BNT re-orients the measuring axes</b> off the deep mode, onto thin, " +
              "signal-poor slices (with amplified, correlated noise). The projections " +
              "<b>flatten toward noise</b> and FoM₃ collapses to 0.26×. " +
              "<b>The cloud has not moved.</b>",
         ratio: "0.26×", abs: "3045 → 779", marg: "σ(σ₈) +65%  (calibrated loss)" },
    3: { cap: "So where did it go? The cosmology lives in the cloud's <b>shape</b>, " +
              "the <b>relations between maps</b>. In this frame, no single-map " +
              "projection can see it.",
         ratio: "0.26×", abs: "3045 → 779", marg: "info is intact, just off-axis" },
    4: { cap: "The <span class='c-cnn'>CNN mixes channels first</span>, so it can draw " +
              "<b>its own axis back along the cloud</b> (undo B for free) and read it richly " +
              "again, FoM₃ ≈ 0.96×. <b>Basis-robust, not “smarter.”</b>",
         ratio: "0.96×", abs: "3326 → 3186  ·  CNN", marg: "channel-mixing ⇒ frame-agnostic" },
    5: { cap: "<b>Whitening</b> rotates to a <b>different clean frame</b> and the per-map " +
              "projections come back, FoM₃ recovers to <b>1.06×</b>. " +
              "Nothing was lost; the collapse was the <b>frame</b>.",
         ratio: "1.06×", abs: "fully recovered", marg: "σ(σ₈) back to no-BNT" }
  };

  /* ===================== deterministic toy cloud ========================== */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gaussian(rng) {            // Box-Muller
    var u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* Each pixel is a latent {L, S, noise}:
   *   L = coordinate along the deep mode -- SKEWED with a heavy positive tail
   *       (the non-Gaussian peaks: rare high-convergence pixels / clusters).
   *   S = coordinate across the deep mode -- small, near-Gaussian.
   *   noise = a fixed standard-normal draw, scaled at render time by the
   *           current axis's noise amplification (so the shadow broadens
   *           smoothly without shimmering).
   * The cosmological information lives in the deep-mode skew (L); projecting
   * across the deep mode (BNT axes) removes it. */
  function buildCloud() {
    var rng = mulberry32(20260615);
    var pts = [], peakThresh = 1.9;
    for (var i = 0; i < N_POINTS; i++) {
      var base = gaussian(rng) * 1.00;
      // heavy positive tail ~15% of the time -> non-Gaussian peaks along L
      var tail = (rng() < 0.16) ? Math.pow(rng(), 0.55) * 3.2 : 0;
      var L = base + tail - 0.45;          // recentre so the bulk sits near 0
      var S = gaussian(rng) * 0.34;        // thin across-mode spread
      pts.push({ L: L, S: S, noise: gaussian(rng), peak: (L > peakThresh) });
    }
    return pts;
  }

  /* ============================ the engine ================================ */
  function Engine(root) {
    this.root = root;
    this.cloudCanvas = root.querySelector(".bnt-cloud");
    this.kernCanvas  = root.querySelector(".bnt-kernels");
    this.meterEl     = root.querySelector(".bnt-meter");
    this.captionEl   = root.querySelector(".bnt-caption");
    this.kernCapEl   = root.querySelector(".bnt-kernels-caption");
    this.cloud = buildCloud();

    this.cur = this._stateForAct(1);   // animated state
    this.tgt = this._stateForAct(1);   // target state
    this.act = 1;
    this.running = false;
    this.autoTimer = null;

    this._buildMeter();
    this._applyCopy(1);
    this._setupCanvas(this.cloudCanvas);
    this._setupCanvas(this.kernCanvas);

    var self = this;
    this._loop = function () { self._frame(); };
    window.addEventListener("resize", function () {
      self._setupCanvas(self.cloudCanvas);
      self._setupCanvas(self.kernCanvas);
    });
  }

  /* Flatten an act into a tweenable numeric state. */
  Engine.prototype._stateForAct = function (act) {
    var A = ACTS[act];
    return {
      a1: A.axes[0].a * DEG, n1: A.axes[0].n,
      a2: A.axes[1].a * DEG, n2: A.axes[1].n,
      cnn: A.cnn, joint: A.joint, kmorph: A.kmorph,
      l1ratio:  (act >= 5) ? FOM.l1_whiten_ratio
              : (act >= 2) ? FOM.l1_bnt_ratio : FOM.l1_nobnt_ratio,
      cnnratio: FOM.cnn_bnt_ratio,
      cnnShow:  (act === 4) ? 1 : (act === 5 ? 0.45 : 0),
      active:   A.active
    };
  };

  Engine.prototype._setupCanvas = function (canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    // Fall back to the attribute size before first layout.
    var cssW = rect.width  || (canvas.width  / 2);
    var cssH = rect.height || (canvas.height / 2);
    canvas._cssW = cssW; canvas._cssH = cssH; canvas._dpr = dpr;
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  };

  /* ----------------------------- control --------------------------------- */
  Engine.prototype.goTo = function (act) {
    act = Math.max(1, Math.min(N_ACTS, act));
    this.act = act;
    this.tgt = this._stateForAct(act);
    this._applyCopy(act);
    this.start();
  };

  Engine.prototype.snapTo = function (act) {   // jump with no animation
    this.cur = this._stateForAct(act);
    this.goTo(act);
  };

  Engine.prototype.start = function () {
    if (!this.running) { this.running = true; requestAnimationFrame(this._loop); }
  };

  Engine.prototype.autoplay = function () {
    var self = this;
    if (this.autoTimer) { clearInterval(this.autoTimer); this.autoTimer = null; }
    this.snapTo(1);
    var act = 1;
    this.autoTimer = setInterval(function () {
      act += 1;
      if (act > N_ACTS) { clearInterval(self.autoTimer); self.autoTimer = null; return; }
      self.goTo(act);
    }, 2500);
  };

  /* ------------------------------ tween ---------------------------------- */
  Engine.prototype._frame = function () {
    var c = this.cur, t = this.tgt, k, moving = false;
    var SMOOTH = 0.12;
    var keys = ["a1", "n1", "a2", "n2", "cnn", "joint", "kmorph",
                "l1ratio", "cnnratio", "cnnShow"];
    for (var i = 0; i < keys.length; i++) {
      k = keys[i];
      var d = t[k] - c[k];
      if (Math.abs(d) > 1e-4) { c[k] += d * SMOOTH; moving = true; }
      else { c[k] = t[k]; }
    }
    c.active = t.active;

    this._drawCloud();
    this._drawKernels();
    this._updateMeter();

    if (moving) { requestAnimationFrame(this._loop); }
    else { this.running = false; }
  };

  /* ============================ cloud panel =============================== */
  Engine.prototype._drawCloud = function () {
    var canvas = this.cloudCanvas, ctx = canvas.getContext("2d");
    var W = canvas._cssW, H = canvas._cssH, dpr = canvas._dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var cx = W * 0.46, cy = H * 0.52;
    var SC = Math.min(W, H) * 0.115;     // scene unit -> px

    // math (x,y up) -> screen
    function P(mx, my) { return [cx + mx * SC, cy - my * SC]; }

    var dHat = [Math.cos(DEEP_DEG * DEG), Math.sin(DEEP_DEG * DEG)];
    var pHat = [Math.cos((DEEP_DEG + 90) * DEG), Math.sin((DEEP_DEG + 90) * DEG)];

    // --- deep-mode guide line (faint, persistent) ---
    var gl = 3.7;
    var g0 = P(-gl * dHat[0], -gl * dHat[1]), g1 = P(gl * dHat[0], gl * dHat[1]);
    ctx.save();
    ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5; ctx.strokeStyle = hexA(C_DEEP, 0.55);
    ctx.beginPath(); ctx.moveTo(g0[0], g0[1]); ctx.lineTo(g1[0], g1[1]); ctx.stroke();
    ctx.restore();
    // deep-mode label
    var lp = P(gl * dHat[0], gl * dHat[1]);
    label(ctx, "deep common mode", lp[0] + 6, lp[1] - 6, C_DEEP, "left", 13, true);

    // --- joint density highlight (act 3): the cloud's shape holds the info ---
    if (this.cur.joint > 0.01) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-DEEP_DEG * DEG);            // screen y-down => negative angle
      var grad = ctx.createRadialGradient(0, 0, 4, 0, 0, SC * 3.4);
      grad.addColorStop(0, hexA(C_DEEP, 0.30 * this.cur.joint));
      grad.addColorStop(1, hexA(C_DEEP, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(SC * 0.5, 0, SC * 3.2, SC * 0.95, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }

    // --- the cloud of points (cosmology-fixed; identical every act) ---
    for (var i = 0; i < this.cloud.length; i++) {
      var pt = this.cloud[i];
      var mx = pt.L * dHat[0] + pt.S * pHat[0];
      var my = pt.L * dHat[1] + pt.S * pHat[1];
      var s = P(mx, my);
      if (pt.peak) {
        // graded by amplitude so the gold points read as the TAIL of one cloud,
        // not a separate population (rare high-kappa peaks = the non-Gaussian signal)
        var pr = 2.0 + Math.min(2.3, (pt.L - 1.9) * 0.9);
        ctx.fillStyle = hexA(C_PEAK, 0.92);
        ctx.beginPath(); ctx.arc(s[0], s[1], pr, 0, 2 * Math.PI); ctx.fill();
      } else {
        ctx.fillStyle = hexA(C_CLOUD, 0.5);
        ctx.beginPath(); ctx.arc(s[0], s[1], 1.7, 0, 2 * Math.PI); ctx.fill();
      }
    }

    // label the non-Gaussian tail (the gold points) — geometric acts only
    if (this.cur.joint < 0.4) {
      var pk = P(2.55 * dHat[0], 2.55 * dHat[1]);
      label(ctx, "rare high-κ peaks", pk[0] + 13, pk[1] + 18, C_PEAK, "left", 12, true);
      label(ctx, "(non-Gaussian tail)", pk[0] + 13, pk[1] + 33, C_PEAK, "left", 11, false);
    }

    // --- the two per-map measuring axes + their shadows ---
    var axColor = C_L1;   // these axes are always the per-map (ell-1) axes
    this._drawAxisAndShadow(ctx, P, cx, cy, SC, this.cur.a1, this.cur.n1, +1, axColor, "map i");
    this._drawAxisAndShadow(ctx, P, cx, cy, SC, this.cur.a2, this.cur.n2, -1, axColor, "map j");

    // --- the CNN's own axis along the deep mode (act 4) ---
    if (this.cur.cnn > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.cur.cnn;
      this._drawAxisAndShadow(ctx, P, cx, cy, SC, DEEP_DEG * DEG, 1.0, +1, C_CNN,
                              "CNN axis", true);
      ctx.restore();
    }
  };

  /* Draw one measuring axis (arrow through the centre) and the histogram
   * "shadow" of the cloud projected onto it. side = +1/-1 chooses which
   * perpendicular side the ribbon sits on (keeps the two shadows apart). */
  Engine.prototype._drawAxisAndShadow = function (ctx, P, cx, cy, SC, ang, noiseAmp,
                                                   side, color, name, isCNN) {
    var uHat = [Math.cos(ang), Math.sin(ang)];
    var perp = [Math.cos(ang + side * 90 * DEG), Math.sin(ang + side * 90 * DEG)];

    // axis line through centre
    var L = 3.4;
    var aEnd = P(L * uHat[0], L * uHat[1]);
    var aBeg = P(-L * uHat[0], -L * uHat[1]);
    ctx.save();
    ctx.lineWidth = isCNN ? 3.0 : 2.2;
    ctx.strokeStyle = hexA(color, isCNN ? 0.95 : 0.85);
    ctx.beginPath(); ctx.moveTo(aBeg[0], aBeg[1]); ctx.lineTo(aEnd[0], aEnd[1]); ctx.stroke();
    // arrowhead at positive end
    arrowHead(ctx, aEnd, ang, color);
    ctx.restore();

    // --- the shadow histogram ---
    var hist = this._projectHistogram(ang, noiseAmp);

    /* "Richness" = how much of the cosmology-bearing deep-mode skew survives
     * the projection, divided by the channel's noise amplification. It drives
     * the shadow's height AND opacity, so a BNT (across-cloud, amplified-noise)
     * axis renders as low + pale + bland, while a deep-aligned, clean axis
     * renders as tall + solid + skewed. Monotone in the faithful quantity. */
    var skewSurv = Math.abs(Math.cos(ang - DEEP_DEG * DEG));   // 1 along deep mode
    var rich = Math.max(0, Math.min(1, skewSurv / noiseAmp));
    var heightScale = SC * (0.5 + 2.05 * rich) / hist.refPeak;
    var standoff = SC * 1.65;
    var opacity = 0.14 + 0.46 * rich;          // capped so the cloud shows through

    var nb = hist.counts.length;
    var basePts = [], topPts = [];
    for (var b = 0; b < nb; b++) {
      var s = HMIN + (b + 0.5) / nb * (HMAX - HMIN);
      var along = s;                          // scene units along the axis
      var bx = cx + (uHat[0] * along * SC) + perp[0] * standoff;
      var by = cy - (uHat[1] * along * SC) - perp[1] * standoff;   // y flip
      var h = hist.counts[b] * heightScale;
      basePts.push([bx, by]);
      topPts.push([bx + perp[0] * h, by - perp[1] * h]);
    }

    ctx.save();
    // baseline
    ctx.lineWidth = 1; ctx.strokeStyle = hexA(color, 0.35);
    ctx.beginPath(); ctx.moveTo(basePts[0][0], basePts[0][1]);
    for (var j = 1; j < basePts.length; j++) ctx.lineTo(basePts[j][0], basePts[j][1]);
    ctx.stroke();
    // filled histogram area
    ctx.beginPath();
    ctx.moveTo(basePts[0][0], basePts[0][1]);
    for (var k = 0; k < topPts.length; k++) ctx.lineTo(topPts[k][0], topPts[k][1]);
    for (var m = basePts.length - 1; m >= 0; m--) ctx.lineTo(basePts[m][0], basePts[m][1]);
    ctx.closePath();
    ctx.fillStyle = hexA(color, opacity);
    ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = hexA(color, Math.min(1, opacity + 0.25));
    ctx.beginPath();
    ctx.moveTo(topPts[0][0], topPts[0][1]);
    for (var q = 1; q < topPts.length; q++) ctx.lineTo(topPts[q][0], topPts[q][1]);
    ctx.stroke();

    // axis name near the ribbon's far end
    var nm = basePts[Math.round(nb * 0.86)];
    label(ctx, name, nm[0] + perp[0] * 14, nm[1] - perp[1] * 14, color, "center", 13, true);
    ctx.restore();
  };

  /* Histogram of (deep-mode-skewed signal projected on the axis) + amplified
   * shape noise. refPeak (the no-BNT peak count) is cached so all shadows share
   * ONE global height scale -- collapsed shadows are genuinely shorter. */
  Engine.prototype._projectHistogram = function (ang, noiseAmp) {
    var cs = Math.cos(ang - DEEP_DEG * DEG);          // weight on L (deep skew)
    var cp = Math.cos(ang - (DEEP_DEG + 90) * DEG);   // weight on S (across)
    var nb = N_BINS, counts = new Array(nb).fill(0);
    for (var i = 0; i < this.cloud.length; i++) {
      var pt = this.cloud[i];
      var s = pt.L * cs + pt.S * cp + pt.noise * NOISE_SCALE * noiseAmp;
      var b = Math.floor((s - HMIN) / (HMAX - HMIN) * nb);
      if (b >= 0 && b < nb) counts[b] += 1;
    }
    // light 3-tap smoothing for a clean curve
    var sm = counts.slice();
    for (var j = 1; j < nb - 1; j++) sm[j] = (counts[j-1] + 2*counts[j] + counts[j+1]) / 4;

    if (this._refPeak == null) {     // calibrate once on the no-BNT axis
      var p = 0; for (var r = 0; r < nb; r++) if (sm[r] > p) p = sm[r];
      this._refPeak = p || 1;
    }
    return { counts: sm, refPeak: this._refPeak };
  };

  /* ============================ kernel inset ============================== */
  /* Lensing efficiency kernels q(z_lens). NO-BNT: four DEEP kernels, each
   * integrating lensing from z=0 up to its source bin -> nested, heavily
   * overlapping at low z (the shared deep field = the "deep common mode";
   * higher bins reach deeper and stronger). BNT keeps bin 1 -- "the shallowest,
   * weakest bin" (B row 1 = (1,0,0,0)) -- a low-z shallow kernel, and turns the
   * other three into THIN lens-z shells (the nulled differences). So the BNT
   * frame is "1 shallow map + 3 thin slices", NOT "1 broad + 3 thin".
   * (BNT_THEORY_DEEP_DIVE.md §0/§1.2.) kmorph in [0,1] interpolates. Colours are
   * a neutral sequential ramp so they never read as the method colours. */
  Engine.prototype._drawKernels = function () {
    var canvas = this.kernCanvas, ctx = canvas.getContext("2d");
    var W = canvas._cssW, H = canvas._cssH, dpr = canvas._dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var m = this.cur.kmorph;
    var padL = 14, padR = 8, padT = 8, padB = 22;
    var x0 = padL, x1 = W - padR, y0 = H - padB, yTop = padT;
    var zMin = 0, zMax = 2.0;
    function Y(v) { return y0 - v * (y0 - yTop); }    // v in [0,1]

    // axis
    ctx.strokeStyle = hexA(C_MUTE, 0.7); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
    label(ctx, "z", x1 - 4, y0 + 15, C_MUTE, "right", 12, false);

    // no-BNT: nested deep kernels (arch rising from 0, increasing reach+depth)
    var zReach = [0.72, 1.12, 1.55, 1.95];     // each bin's source horizon
    var depthN = [0.40, 0.58, 0.78, 1.00];     // deeper bins lens more (taller)
    // BNT: bin 1 kept (= its no-BNT kernel); bins 2-4 -> thin lens-z shells
    var shellZ = [0.0, 0.78, 1.18, 1.60];      // shell centres (index 0 unused)
    var shellA = [0.0, 0.74, 0.86, 0.98];      // shell heights
    var shellW = 0.055;
    var ramp = ["#b9863a", "#9fb2c6", "#6f88a6", "#42607f"]; // bin1 warm = "kept"

    function qNoBNT(i, z) {                       // nested arch, 0..zReach[i]
      var t = z / zReach[i];
      if (t <= 0 || t >= 1) return 0;
      return depthN[i] * Math.sin(Math.PI * t);
    }
    function qBNT(i, z) {
      if (i === 0) return qNoBNT(0, z);           // kept shallow map
      var d = (z - shellZ[i]) / shellW;
      return shellA[i] * Math.exp(-0.5 * d * d);  // thin shell
    }

    for (var i = 0; i < 4; i++) {
      ctx.beginPath();
      var started = false, px, z, v;
      for (px = x0; px <= x1; px += 2) {
        z = zMin + (px - x0) / (x1 - x0) * (zMax - zMin);
        v = (1 - m) * qNoBNT(i, z) + m * qBNT(i, z);
        var yy = Y(v);
        if (!started) { ctx.moveTo(px, yy); started = true; } else { ctx.lineTo(px, yy); }
      }
      ctx.lineTo(x1, y0); ctx.lineTo(x0, y0); ctx.closePath();
      ctx.fillStyle = hexA(ramp[i], 0.34);
      ctx.fill();
      ctx.strokeStyle = hexA(ramp[i], 0.95); ctx.lineWidth = 1.6;
      ctx.beginPath();
      started = false;
      for (px = x0; px <= x1; px += 2) {
        z = zMin + (px - x0) / (x1 - x0) * (zMax - zMin);
        v = (1 - m) * qNoBNT(i, z) + m * qBNT(i, z);
        if (!started) { ctx.moveTo(px, Y(v)); started = true; } else { ctx.lineTo(px, Y(v)); }
      }
      ctx.stroke();
    }

    // flag the kept shallow map once nulling has happened (left-anchored so it never clips)
    if (m > 0.55) {
      label(ctx, "kept (shallow)", x0 + 2, Y(depthN[0]) - 8, ramp[0], "left", 10.5, true);
    }

    var capNo = "deep, nested kernels overlapping at low z (redundant)";
    var capYes = "1 shallow map + 3 thin lens-z slices (signal-poor)";
    if (this.kernCapEl) this.kernCapEl.innerHTML = (m < 0.5) ? capNo : capYes;
  };

  /* ============================== meter =================================== */
  Engine.prototype._buildMeter = function () {
    this.meterEl.innerHTML =
      '<div class="bnt-meter-title">FoM₃ &nbsp;/&nbsp; no-BNT</div>' +
      '<div class="bnt-meter-plot">' +
        '<div class="bnt-bars">' +
          '<div class="bnt-baseline"><span>1.00×</span></div>' +
          '<div class="bnt-bar bnt-bar--l1">' +
            '<div class="bnt-bar-fill"></div>' +
            '<div class="bnt-bar-ratio"></div>' +
            '<div class="bnt-bar-name">ℓ1</div>' +
          '</div>' +
          '<div class="bnt-bar bnt-bar--cnn">' +
            '<div class="bnt-bar-fill"></div>' +
            '<div class="bnt-bar-ratio"></div>' +
            '<div class="bnt-bar-name">CNN</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="bnt-meter-abs"></div>' +
      '<div class="bnt-meter-marg"></div>';
    this._m = {
      l1Fill:  this.meterEl.querySelector(".bnt-bar--l1 .bnt-bar-fill"),
      l1Ratio: this.meterEl.querySelector(".bnt-bar--l1 .bnt-bar-ratio"),
      cnnBar:  this.meterEl.querySelector(".bnt-bar--cnn"),
      cnnFill: this.meterEl.querySelector(".bnt-bar--cnn .bnt-bar-fill"),
      cnnRatio:this.meterEl.querySelector(".bnt-bar--cnn .bnt-bar-ratio"),
      abs:     this.meterEl.querySelector(".bnt-meter-abs"),
      marg:    this.meterEl.querySelector(".bnt-meter-marg"),
      baseline:this.meterEl.querySelector(".bnt-baseline")
    };
    // baseline at 1.00x within a 0..1.2 range
    this._m.baseline.style.bottom = (1.00 / 1.20 * 100) + "%";
  };

  Engine.prototype._updateMeter = function () {
    var RMAX = 1.20;
    var l1 = this.cur.l1ratio, cnn = this.cur.cnnratio, show = this.cur.cnnShow;
    this._m.l1Fill.style.height = (Math.min(l1, RMAX) / RMAX * 100) + "%";
    this._m.l1Ratio.textContent = l1.toFixed(2) + "×";
    this._m.cnnFill.style.height = (Math.min(cnn, RMAX) / RMAX * 100) + "%";
    this._m.cnnRatio.textContent = cnn.toFixed(2) + "×";
    this._m.cnnBar.style.opacity = show;
    // de-emphasise whichever method isn't active
    this._m.l1Fill.style.filter  = (this.cur.active === "l1")  ? "none" : "saturate(0.55)";
  };

  /* ============================ captions ================================= */
  Engine.prototype._applyCopy = function (act) {
    var c = ACT_COPY[act];
    if (!c) return;
    this.captionEl.innerHTML =
      '<span class="bnt-actno">' + act + '/5</span>' + c.cap;
    this._m.abs.innerHTML = c.abs;
    this._m.marg.innerHTML = c.marg;
  };

  /* ============================ helpers =================================== */
  function hexA(hex, a) {
    if (hex[0] !== "#") return hex;
    var r = parseInt(hex.substr(1, 2), 16),
        g = parseInt(hex.substr(3, 2), 16),
        b = parseInt(hex.substr(5, 2), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function label(ctx, text, x, y, color, align, size, bold) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "middle";
    ctx.font = (bold ? "600 " : "400 ") + (size || 13) +
               "px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function arrowHead(ctx, tip, ang, color) {
    var s = 9;
    ctx.save();
    ctx.fillStyle = color;
    ctx.translate(tip[0], tip[1]);
    ctx.rotate(-ang);            // canvas y-down vs math y-up
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-s, -s * 0.5); ctx.lineTo(-s, s * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  Engine.prototype.resize = function () {
    this._setupCanvas(this.cloudCanvas);
    this._setupCanvas(this.kernCanvas);
  };

  /* ===================================================================== *
   *  SHARED: canvas fit, 4x4 matrix algebra, the BNT operator, tween step  *
   * ===================================================================== */
  function fitCanvas(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.getBoundingClientRect();
    var cssW = rect.width || (canvas.width / 2), cssH = rect.height || (canvas.height / 2);
    canvas._cssW = cssW; canvas._cssH = cssH; canvas._dpr = dpr;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  }
  // the pipeline's nulling matrix (tomo4_bnt_v1; BNT_THEORY_DEEP_DIVE.md §"Notation")
  var BNT_B = [[ 1,      0,      0,     0],
               [-1,      1,      0,     0],
               [ 0.452, -1.452,  1,     0],
               [ 0,      0.251, -1.251, 1]];
  function matVec(M, v) {
    var o = [0, 0, 0, 0];
    for (var i = 0; i < 4; i++) { for (var j = 0; j < 4; j++) o[i] += M[i][j] * v[j]; }
    return o;
  }
  function matMul(A, B) {
    var C = [];
    for (var i = 0; i < 4; i++) { C.push([0, 0, 0, 0]);
      for (var j = 0; j < 4; j++) { for (var k = 0; k < 4; k++) C[i][j] += A[i][k] * B[k][j]; } }
    return C;
  }
  function transpose(M) {
    var T = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) T[i][j] = M[j][i];
    return T;
  }
  function invert4(M) {                         // Gauss-Jordan
    var a = [];
    for (var i = 0; i < 4; i++) { a.push(M[i].slice().concat([0,0,0,0])); a[i][4 + i] = 1; }
    for (var c = 0; c < 4; c++) {
      var piv = a[c][c];
      for (var k = 0; k < 8; k++) a[c][k] /= piv;
      for (var r = 0; r < 4; r++) { if (r === c) continue;
        var f = a[r][c]; for (var k2 = 0; k2 < 8; k2++) a[r][k2] -= f * a[c][k2]; }
    }
    var inv = []; for (var i2 = 0; i2 < 4; i2++) inv.push(a[i2].slice(4, 8));
    return inv;
  }
  var BNT_Binv = invert4(BNT_B);
  var BNT_BBt  = matMul(BNT_B, transpose(BNT_B));   // noise covariance after BNT
  function tweenStep(cur, tgt, keys, smooth) {
    var moving = false;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], d = tgt[k] - cur[k];
      if (Math.abs(d) > 1e-4) { cur[k] += d * smooth; moving = true; } else cur[k] = tgt[k];
    }
    return moving;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // neutral diverging cell colour (teal +, purple −), distinct from the method colours
  function cellColor(v, vmax) {
    var t = Math.max(0, Math.min(1, Math.abs(v) / vmax));
    return hexA(v >= 0 ? "#1b9e77" : "#7b6cae", 0.10 + 0.85 * t);
  }
  // viridis colormap for the convergence-map tiles (perceptual, colourblind-safe)
  var VIRIDIS = [[68,1,84],[72,40,120],[62,74,137],[49,104,142],[38,130,142],
                 [31,158,137],[53,183,121],[110,206,88],[181,222,43],[253,231,37]];
  function viridis(t) {
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    var x = t * (VIRIDIS.length - 1), i = Math.floor(x), f = x - i;
    if (i >= VIRIDIS.length - 1) return VIRIDIS[VIRIDIS.length - 1];
    var a = VIRIDIS[i], b = VIRIDIS[i + 1];
    return [Math.round(a[0] + (b[0]-a[0])*f), Math.round(a[1] + (b[1]-a[1])*f), Math.round(a[2] + (b[2]-a[2])*f)];
  }

  /* ===================================================================== *
   *  SLIDE 2 — "Signal & noise under BNT: who can read it"  (#3 + #4)       *
   *  The mechanism: B scatters the redundant deep signal into thin slices   *
   *  and turns independent noise into amplified, correlated noise. The      *
   *  per-map ell-1 goes blind; the cross channel restores only the 2-point  *
   *  share; the CNN un-mixes (B^-1) and recovers. All from the real B.      *
   * ===================================================================== */
  function MechEngine(root) {
    this.root = root;
    this.lineCanvas = root.querySelector(".bnt-mech-lines");
    this.covCanvas  = root.querySelector(".bnt-mech-cov");
    this.ladderEl   = root.querySelector(".bnt-mech-ladder");
    this.captionEl  = root.querySelector(".bnt-caption");
    this.covCapEl   = root.querySelector(".bnt-mech-cov-cap");
    this.nActs = 5;
    this.data = this._buildData();
    this.cur = this._stateForAct(1);
    this.tgt = this._stateForAct(1);
    this.act = 1; this.running = false; this.autoTimer = null;
    fitCanvas(this.lineCanvas); fitCanvas(this.covCanvas);
    this._buildLadder(); this._applyCopy(1);
    var self = this;
    this._loop = function () { self._frame(); };
    window.addEventListener("resize", function () { self.resize(); });
  }
  MechEngine.prototype.resize = function () { fitCanvas(this.lineCanvas); fitCanvas(this.covCanvas); };

  MechEngine.MECH_COPY = {
    1: "Four tomographic maps mostly share <b>one common signal</b> (plus small increments), so they are strongly <b>redundant</b>. Their shape noise is <b>independent</b>, equal in every bin.",
    2: "<b>BNT</b> differences them (κ′ᵢ = Σⱼ Bᵢⱼ κⱼ): the common signal <b>cancels</b>, leaving one shallow map and three thin <b>slices</b>. The structure is now <b>gone from each map</b>, not hidden inside it.",
    3: "The noise is mixed too: <b>amplified</b> (×1, 1.4, 1.8, 1.6) and <b>correlated</b> (−0.71). Each nulled map is tiny signal under big noise, so a per-map <span class='c-l1'>ℓ1</span> sees almost nothing (<b>0.15×</b>).",
    4: "<b>Cross maps</b> help only partly (<b>0.22×</b>): they are fixed <b>pairwise</b> products (product = zero-lag joint, conv = 2-point), recovering the pairwise share, not the higher-order multi-bin info. The ℓ1 is <b>nonlinear</b>, so no finite set of products is complete; capturing all of it needs the full tree of higher moments (triplets, quadruplets, …).",
    5: "But BNT was <b>linear</b>, so you need none of that tree: <b>recombine</b> the maps (κ = B⁻¹κ′) and the common signal <b>returns</b>. The <span class='c-cnn'>CNN</span> does exactly this in its first layer, for free (<b>0.93×</b>); any clean frame (<b>whitening</b>) gives <b>1.06×</b>. The information was in the <b>joint</b>, not any single map."
  };

  MechEngine.prototype._buildData = function () {
    // 2-D toy convergence fields: a shared deep field (a few Gaussian "peak"
    // blobs) seen by all four bins at increasing depth (redundant) + small
    // per-bin increments + independent shape noise. BNT is then applied per
    // pixel with the real B; the CNN reconstruction is B^-1(BNT) = the deepest
    // original map.
    var rng = mulberry32(70707), G = 44;
    var blobs = [
      { x: 0.30, y: 0.32, a: 1.20, s: 0.085 },
      { x: 0.67, y: 0.58, a: 1.00, s: 0.075 },
      { x: 0.48, y: 0.78, a: 0.72, s: 0.100 },
      { x: 0.80, y: 0.26, a: 0.62, s: 0.090 }
    ];
    var f = new Array(G * G);
    for (var yy = 0; yy < G; yy++) for (var xx = 0; xx < G; xx++) {
      var X = xx / (G - 1), Y = yy / (G - 1), v = 0.16 * Math.sin(2 * Math.PI * (X * 1.3 + Y * 0.7));
      for (var bI = 0; bI < blobs.length; bI++) {
        var b = blobs[bI], dx = X - b.x, dy = Y - b.y;
        v += b.a * Math.exp(-(dx * dx + dy * dy) / (2 * b.s * b.s));
      }
      f[yy * G + xx] = v;
    }
    var w = [0.55, 0.78, 1.0, 1.18], sigma = 0.30;
    var xobs = [[], [], [], []];
    for (var i = 0; i < 4; i++) {
      for (var p = 0; p < G * G; p++) {
        var inc = 0.10 * Math.sin(2 * Math.PI * ((p % G) / (G - 1) * (1.5 + i) + i * 0.5));
        xobs[i].push(w[i] * f[p] + inc + sigma * gaussian(rng));
      }
    }
    var xb = [[], [], [], []];
    for (var p2 = 0; p2 < G * G; p2++) {
      var bv = matVec(BNT_B, [xobs[0][p2], xobs[1][p2], xobs[2][p2], xobs[3][p2]]);
      for (var i3 = 0; i3 < 4; i3++) xb[i3].push(bv[i3]);
    }
    return { G: G, xobs: xobs, xb: xb, recon: xobs[3] };
  };

  MechEngine.prototype._stateForAct = function (act) {
    return {
      base:   1,                  // ladder: ℓ1 no-BNT reference (always shown)
      kmorph: act >= 2 ? 1 : 0,   // BNT applied
      lAuto:  act >= 3 ? 1 : 0,   // ladder: ℓ1 auto
      lCross: act >= 4 ? 1 : 0,   // ladder: +cross
      lCNN:   act >= 5 ? 1 : 0,   // ladder: CNN + whitening
      recon:  act >= 5 ? 1 : 0    // B^-1 reconstruction tile
    };
  };
  MechEngine.prototype.goTo = function (act) {
    act = Math.max(1, Math.min(this.nActs, act));
    this.act = act; this.tgt = this._stateForAct(act); this._applyCopy(act); this.start();
  };
  MechEngine.prototype.snapTo = function (act) { this.cur = this._stateForAct(act); this.goTo(act); };
  MechEngine.prototype.start = function () {
    if (!this.running) { this.running = true; requestAnimationFrame(this._loop); }
  };
  MechEngine.prototype.autoplay = function () {
    var self = this; if (this.autoTimer) clearInterval(this.autoTimer);
    this.snapTo(1); var a = 1;
    this.autoTimer = setInterval(function () {
      a += 1; if (a > self.nActs) { clearInterval(self.autoTimer); self.autoTimer = null; return; }
      self.goTo(a);
    }, 2600);
  };
  MechEngine.prototype._frame = function () {
    var moving = tweenStep(this.cur, this.tgt,
      ["base", "kmorph", "lAuto", "lCross", "lCNN", "recon"], 0.12);
    this._drawTiles(); this._drawCov(); this._updateLadder();
    if (moving) requestAnimationFrame(this._loop); else this.running = false;
  };

  // grayscale heatmap of one GxG field into a reusable offscreen canvas
  MechEngine.prototype._tileImage = function (vals, G) {
    if (!this._off) { this._off = document.createElement("canvas"); this._off.width = G; this._off.height = G; }
    var octx = this._off.getContext("2d"), img = octx.createImageData(G, G);
    var lo = -0.8, hi = 2.0;
    for (var p = 0; p < G * G; p++) {
      var t = (vals[p] - lo) / (hi - lo);
      var c = viridis(t);                         // high κ → yellow peaks, low → deep purple
      var o = p * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    return this._off;
  };

  // four κ map tiles (redundant → BNT slices), then the B^-1 reconstruction tile
  MechEngine.prototype._drawTiles = function () {
    var cv = this.lineCanvas, ctx = cv.getContext("2d");
    var W = cv._cssW, H = cv._cssH, dpr = cv._dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    var d = this.data, m = this.cur.kmorph, recon = this.cur.recon, G = d.G;

    var pad = 16, gap = 12, topGap = 32;
    var leftW = W * 0.52;
    var tile = Math.min((leftW - pad * 2 - gap) / 2, (H - pad - topGap * 2 - gap) / 2);
    var ox = pad, oy = pad + topGap;
    var pos = [[ox, oy], [ox + tile + gap, oy],
               [ox, oy + tile + gap + topGap], [ox + tile + gap, oy + tile + gap + topGap]];

    label(ctx, m < 0.5 ? "4 maps: one common signal (redundant)"
                       : "BNT: common signal cancelled (1 shallow + 3 slices)",
          ox, pad + 4, C_INK, "left", 13.5, true);

    var tileFade = 1 - 0.4 * recon;
    for (var k = 0; k < 4; k++) {
      var vals = new Array(G * G);
      for (var p = 0; p < G * G; p++) vals[p] = lerp(d.xobs[k][p], d.xb[k][p], m);
      var off = this._tileImage(vals, G), px = pos[k][0], py = pos[k][1];
      ctx.save(); ctx.globalAlpha = tileFade;
      ctx.drawImage(off, px, py, tile, tile);
      ctx.restore();
      var kept = (m > 0.5 && k === 0);
      ctx.strokeStyle = hexA(m > 0.5 ? C_L1 : C_MUTE, m > 0.5 ? 0.85 : 0.5);
      ctx.lineWidth = kept ? 2.6 : 1.2;
      ctx.strokeRect(px, py, tile, tile);
      label(ctx, (m > 0.5 ? "κ′" : "κ") + (k + 1), px + 3, py - 9,
            m > 0.5 ? C_L1 : C_INK, "left", 13, true);
      if (kept) label(ctx, "kept (shallow)", px + tile, py - 9, C_MUTE, "right", 10.5, false);
    }

    // act 5: recombine the slices (B^-1) → the deep field reappears (the CNN's move)
    if (recon > 0.02) {
      ctx.save(); ctx.globalAlpha = recon;
      var rx = leftW + 6, ay = oy + tile * 0.5;
      ctx.strokeStyle = C_CNN; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(rx, ay); ctx.lineTo(rx + 54, ay); ctx.stroke();
      arrowHead(ctx, [rx + 54, ay], 0, C_CNN);
      label(ctx, "B⁻¹ combine", rx + 26, ay - 13, C_CNN, "center", 12.5, true);
      var rt = Math.min(tile * 1.7, W - (rx + 66) - pad, H - pad - topGap * 2);
      var rtx = rx + 66, rty = oy + topGap;
      var off2 = this._tileImage(d.recon, G);
      ctx.drawImage(off2, rtx, rty, rt, rt);
      ctx.strokeStyle = C_CNN; ctx.lineWidth = 2.8; ctx.strokeRect(rtx, rty, rt, rt);
      label(ctx, "common signal rebuilt", rtx + rt / 2, rty - 9, C_CNN, "center", 13.5, true);
      label(ctx, "(the CNN does this for free)", rtx + rt / 2, rty + rt + 15, C_CNN, "center", 11.5, false);
      ctx.restore();
    }
  };

  MechEngine.prototype._drawCov = function () {
    var cv = this.covCanvas, ctx = cv.getContext("2d");
    var W = cv._cssW, H = cv._cssH, dpr = cv._dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    var m = this.cur.kmorph, grid = Math.min(W, H) - 8, cell = grid / 4;
    var ox = (W - grid) / 2, oy = (H - grid) / 2, vmax = 3.4;
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      var I = (i === j) ? 1 : 0;
      var v = lerp(I, BNT_BBt[i][j], m);
      ctx.fillStyle = cellColor(v, vmax);
      ctx.fillRect(ox + j * cell + 1, oy + i * cell + 1, cell - 2, cell - 2);
    }
    ctx.strokeStyle = hexA(C_MUTE, 0.4); ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, grid, grid);
    if (this.covCapEl) this.covCapEl.innerHTML = (m < 0.5)
      ? "white: independent, equal σ" : "amplified + correlated (B Bᵀ)";
  };

  MechEngine.prototype._buildLadder = function () {
    // recovery ladder, L1-auto arm (M3): auto -> +cross -> CNN -> whitening
    this._rungs = [
      { key: "base",   ratio: 1.00, name: "no-BNT", color: C_L1 },
      { key: "lAuto",  ratio: 0.15, name: "auto",   color: C_L1 },
      { key: "lCross", ratio: 0.22, name: "+cross", color: C_L1 },
      { key: "lCNN",   ratio: 0.93, name: "CNN",    color: C_CNN }
    ];
    var html = '<div class="bnt-meter-title">FoM₃ / no-BNT</div>' +
      '<div class="bnt-meter-plot"><div class="bnt-bars">' +
      '<div class="bnt-baseline"><span>1.00×</span></div>';
    for (var i = 0; i < this._rungs.length; i++) {
      var r = this._rungs[i];
      html += '<div class="bnt-bar" data-rung="' + i + '">' +
        '<div class="bnt-bar-fill"' + (r.hatch ? ' style="background-image:repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(255,255,255,.6) 3px,rgba(255,255,255,.6) 5px);"' : '') + '></div>' +
        '<div class="bnt-bar-ratio"></div><div class="bnt-bar-name">' + r.name + '</div></div>';
    }
    html += '</div></div>';
    this.ladderEl.innerHTML = html;
    var bars = this.ladderEl.querySelectorAll(".bnt-bar");
    this._bars = [];
    for (var b = 0; b < bars.length; b++) {
      this._bars.push({
        el: bars[b],
        fill: bars[b].querySelector(".bnt-bar-fill"),
        ratio: bars[b].querySelector(".bnt-bar-ratio")
      });
      bars[b].querySelector(".bnt-bar-fill").style.background = this._rungs[b].hatch
        ? C_L1 : this._rungs[b].color;
    }
    this.ladderEl.querySelector(".bnt-baseline").style.bottom = (1.0 / 1.2 * 100) + "%";
  };
  MechEngine.prototype._updateLadder = function () {
    var RMAX = 1.2;
    for (var i = 0; i < this._rungs.length; i++) {
      var r = this._rungs[i], shown = this.cur[r.key];
      var bar = this._bars[i];
      bar.fill.style.height = (r.ratio / RMAX * 100 * Math.max(0, Math.min(1, shown))) + "%";
      bar.ratio.textContent = shown > 0.5 ? (r.ratio.toFixed(2) + "×") : "";
      bar.ratio.style.color = r.color;
      bar.el.style.opacity = 0.25 + 0.75 * Math.max(0, Math.min(1, shown));
    }
  };
  MechEngine.prototype._applyCopy = function (act) {
    this.captionEl.innerHTML = '<span class="bnt-actno">' + act + '/' + this.nActs + '</span>' +
      MechEngine.MECH_COPY[act];
  };

  /* ===================================================================== *
   *  SLIDE 3 — "What survives BNT: the 2-point rule"  (#5)                  *
   *  C-hat -> B C-hat B^T is invertible (B known) -> auto+cross 2-pt is     *
   *  EXACTLY invariant. Keep only the diagonal (auto-only) -> can't invert  *
   *  -> not invariant. Per-map higher-order stats live on the wrong side.   *
   * ===================================================================== */
  function TwoPtEngine(root) {
    this.root = root;
    this.canvas = root.querySelector(".bnt-tp-canvas");
    this.captionEl = root.querySelector(".bnt-caption");
    this.nActs = 5;
    // a plausible SPD auto+cross spectrum matrix and its BNT transform
    this.C = [];
    for (var i = 0; i < 4; i++) { this.C.push([]); for (var j = 0; j < 4; j++) this.C[i].push(Math.pow(0.62, Math.abs(i - j))); }
    this.Cp = matMul(matMul(BNT_B, this.C), transpose(BNT_B));
    this.cur = this._stateForAct(1); this.tgt = this._stateForAct(1);
    this.act = 1; this.running = false; this.autoTimer = null;
    fitCanvas(this.canvas); this._applyCopy(1);
    var self = this; this._loop = function () { self._frame(); };
    window.addEventListener("resize", function () { self.resize(); });
  }
  TwoPtEngine.prototype.resize = function () { fitCanvas(this.canvas); };
  TwoPtEngine.TP_COPY = {
    1: "The <b>two-point</b> information is the full set of <b>auto- and cross-spectra</b>, a 4×4 matrix <b>Ĉ</b>.",
    2: "BNT is linear: it sends <b>Ĉ → B Ĉ Bᵀ</b>. A different matrix, but a <b>known, invertible</b> map.",
    3: "So multiply back: <b>Ĉ = B⁻¹ Ĉ′ B⁻ᵀ</b>. <span class='c-deep'>Nothing is lost</span>: <b>auto+cross power spectra are exactly BNT-invariant</b> (identical posteriors).",
    4: "Keep only the <b>diagonal</b> (auto-spectra alone) and you discard the off-diagonals, so <b>you cannot rebuild Ĉ</b>. Auto-only 2-pt fails by <b>incompleteness</b> (cheap to fix: add the cross-spectra back).",
    5: "<b>The rule:</b> survives BNT ⇔ you can reassemble it. <b>Auto+cross 2-pt: yes</b>, it is <b>linear and complete</b> (B just relabels it, Ĉ↦BĈBᵀ). The <span class='c-l1'>ℓ1</span> / peaks: <b>no</b>, because B mixes the maps and <i>then</i> the histogram throws away the joint (a <b>mix-then-marginalize</b>); no per-channel set closes. That is the collapse."
  };
  TwoPtEngine.prototype._stateForAct = function (act) {
    return { showCp: act >= 2 ? 1 : 0, showInv: act >= 3 ? 1 : 0, showAuto: act >= 4 ? 1 : 0 };
  };
  TwoPtEngine.prototype.goTo = function (act) {
    act = Math.max(1, Math.min(this.nActs, act));
    this.act = act; this.tgt = this._stateForAct(act); this._applyCopy(act); this.start();
  };
  TwoPtEngine.prototype.snapTo = function (act) { this.cur = this._stateForAct(act); this.goTo(act); };
  TwoPtEngine.prototype.start = function () {
    if (!this.running) { this.running = true; requestAnimationFrame(this._loop); }
  };
  TwoPtEngine.prototype.autoplay = function () {
    var self = this; if (this.autoTimer) clearInterval(this.autoTimer);
    this.snapTo(1); var a = 1;
    this.autoTimer = setInterval(function () {
      a += 1; if (a > self.nActs) { clearInterval(self.autoTimer); self.autoTimer = null; return; }
      self.goTo(a);
    }, 2600);
  };
  TwoPtEngine.prototype._frame = function () {
    var moving = tweenStep(this.cur, this.tgt, ["showCp", "showInv", "showAuto"], 0.12);
    this._draw();
    if (moving) requestAnimationFrame(this._loop); else this.running = false;
  };
  TwoPtEngine.prototype._matrix = function (ctx, M, ox, oy, cell, vmax, autoOnly) {
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      var off = (i !== j);
      var greyed = autoOnly && off;
      ctx.fillStyle = greyed ? hexA(C_MUTE, 0.12) : cellColor(M[i][j], vmax);
      ctx.fillRect(ox + j * cell + 1.5, oy + i * cell + 1.5, cell - 3, cell - 3);
      if (greyed) {
        ctx.strokeStyle = hexA(C_MUTE, 0.5); ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ox + j*cell + 4, oy + i*cell + 4);
        ctx.lineTo(ox + (j+1)*cell - 4, oy + (i+1)*cell - 4); ctx.stroke();
      }
    }
    ctx.strokeStyle = hexA(C_INK, 0.5); ctx.lineWidth = 1.4;
    ctx.strokeRect(ox, oy, cell * 4, cell * 4);
  };
  TwoPtEngine.prototype._draw = function () {
    var cv = this.canvas, ctx = cv.getContext("2d");
    var W = cv._cssW, H = cv._cssH, dpr = cv._dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    // reserve vertical room for the matrix titles (above) and the verdict (below),
    // then centre the matrices so nothing clips at the panel edges
    var cell = Math.min(62, (H - 120) / 4), grid = cell * 4, vmax = 1.0;
    var midY = Math.max(grid / 2 + 36, Math.min(H * 0.50, H - grid / 2 - 34));
    var leftX = W * 0.10, rightX = W * 0.56;

    // left: C-hat (always)
    this._matrix(ctx, this.C, leftX, midY - grid / 2, cell, vmax, false);
    label(ctx, "Ĉ  (auto + cross)", leftX + grid / 2, midY - grid / 2 - 16, C_INK, "center", 15, true);

    // forward arrow + C'
    if (this.cur.showCp > 0.02) {
      ctx.save(); ctx.globalAlpha = this.cur.showCp;
      var ay = midY - 12, ax0 = leftX + grid + 14, ax1 = rightX - 14;
      ctx.strokeStyle = C_INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax0, ay); ctx.lineTo(ax1, ay); ctx.stroke();
      arrowHead(ctx, [ax1, ay], 0, C_INK);
      label(ctx, "× B ( · ) Bᵀ", (ax0 + ax1) / 2, ay - 12, C_INK, "center", 13, true);
      this._matrix(ctx, this.Cp, rightX, midY - grid / 2, cell, vmax, this.cur.showAuto > 0.5);
      label(ctx, this.cur.showAuto > 0.5 ? "Ĉ′  (auto-only kept)" : "Ĉ′ = B Ĉ Bᵀ",
            rightX + grid / 2, midY - grid / 2 - 16, C_INK, "center", 15, true);
      ctx.restore();
    }
    // reverse arrow + exact
    if (this.cur.showInv > 0.02 && this.cur.showAuto < 0.5) {
      ctx.save(); ctx.globalAlpha = this.cur.showInv;
      var by = midY + 14, bx0 = rightX - 14, bx1 = leftX + grid + 14;
      ctx.strokeStyle = C_DEEP; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(bx0, by); ctx.lineTo(bx1, by); ctx.stroke(); ctx.setLineDash([]);
      arrowHead(ctx, [bx1, by], Math.PI, C_DEEP);
      label(ctx, "× B⁻¹ ( · ) B⁻ᵀ  →  exact ✓", (bx0 + bx1) / 2, by + 14, C_DEEP, "center", 13, true);
      ctx.restore();
    }
    // auto-only verdict
    if (this.cur.showAuto > 0.5) {
      label(ctx, "off-diagonals gone → can't invert  ✗",
            rightX + grid / 2, midY + grid / 2 + 24, C_L1, "center", 14, true);
    }
    // legend
    label(ctx, "teal + / purple −", W - 12, H - 12, C_MUTE, "right", 11, false);
  };
  TwoPtEngine.prototype._applyCopy = function (act) {
    this.captionEl.innerHTML = '<span class="bnt-actno">' + act + '/' + this.nActs + '</span>' +
      TwoPtEngine.TP_COPY[act];
  };

  /* ====================== reveal.js integration =========================== */
  var ENGINES = { cloud: Engine, mechanism: MechEngine, twopoint: TwoPtEngine };
  var BNTExplainer = {
    _engines: [],

    attach: function (Reveal) {
      var self = this;
      var init = function () {
        var nodes = document.querySelectorAll("[data-bnt-explainer]");
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i]._bntEngine) continue;
          var kind = nodes[i].getAttribute("data-bnt-kind") || "cloud";
          var Klass = ENGINES[kind] || Engine;
          var eng = new Klass(nodes[i]);
          nodes[i]._bntEngine = eng;
          self._engines.push({ section: nodes[i], engine: eng });
          self._wireReplay(nodes[i], eng);
        }
        self._syncFromReveal(Reveal);
      };

      if (Reveal && Reveal.isReady && Reveal.isReady()) { init(); }
      else if (Reveal) { Reveal.on("ready", init); }
      else { document.addEventListener("DOMContentLoaded", init); }

      if (Reveal) {
        Reveal.on("fragmentshown",  function () { self._syncFromReveal(Reveal); });
        Reveal.on("fragmenthidden", function () { self._syncFromReveal(Reveal); });
        Reveal.on("slidechanged",   function () {
          // re-measure canvases (reveal lays the slide out on entry) then sync
          self._engines.forEach(function (e) { if (e.engine.resize) e.engine.resize(); });
          self._syncFromReveal(Reveal);
        });
      }
      // 'R' replays the active slide's animation.
      // Atlas v2 patch (G1c2_PR_REVIEW.md §S5 / G.1.c.3.a):
      // BNTExplainer is a module singleton so each attach() would register
      // a fresh keydown listener — N halo-page visits → N listeners on the
      // document. Each stale listener captures the corresponding (dead)
      // Reveal stub and runs a doomed _currentEngine() call on every R
      // keypress. Gate registration via a module flag so the listener is
      // wired exactly once; queries the LIVE _engines list at call time
      // (not the closed-over Reveal) so it still hits the current active
      // engine after SPA navigation.
      if (!self._keydownWired) {
        self._keydownWired = true;
        document.addEventListener("keydown", function (ev) {
          if (ev.key !== "r" && ev.key !== "R") return;
          // Pick the first engine whose section is currently in the DOM and
          // contains a Reveal-style ".present" marker. Falls back to the
          // first attached engine if no marker is present (single-instance
          // case). This keeps the behaviour close to the original while
          // surviving multi-mount SPA usage.
          var active = null;
          for (var i = 0; i < self._engines.length; i++) {
            var s = self._engines[i].section;
            if (!document.contains(s)) continue;
            if (s.matches(".present, [data-bnt-active]")) {
              active = self._engines[i].engine;
              break;
            }
            if (!active) active = self._engines[i].engine; // fallback
          }
          if (active) active.autoplay();
        });
      }
    },

    _wireReplay: function (section, eng) {
      var btn = section.querySelector(".bnt-replay");
      if (btn) btn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation(); eng.autoplay();
      });
    },

    _currentEngine: function (Reveal) {
      if (!Reveal) return this._engines.length ? this._engines[0].engine : null;
      var cur = Reveal.getCurrentSlide();
      for (var i = 0; i < this._engines.length; i++) {
        if (this._engines[i].section === cur) return this._engines[i].engine;
      }
      return null;
    },

    // Current act = 1 + number of visible bnt fragments on the active slide.
    _syncFromReveal: function (Reveal) {
      // Atlas v2 patch (G1c2_PR_REVIEW.md §S5 / G.1.c.3.a):
      // Skip sections that React has unmounted. BNTExplainer is a module
      // singleton, so each <RevealExplainer> mount appends to _engines but
      // nothing removes the entry on unmount. After SPA navigation away
      // from a halo page, the section element is detached but its engine
      // is still in _engines. Without this filter, goTo() keeps re-syncing
      // the detached engine which re-arms its RAF loop (engines run RAF
      // only while `running`, but goTo() can set running=true), accumulating
      // background CPU drain across visited halo pages. document.contains
      // is the cheap correct test.
      this._engines.forEach(function (e) {
        if (!document.contains(e.section)) return;
        var frags = e.section.querySelectorAll(".bnt-frag");
        var shown = 0;
        for (var i = 0; i < frags.length; i++) {
          if (frags[i].classList.contains("visible")) shown += 1;
        }
        e.engine.goTo(1 + shown);
      });
    }
  };

  global.BNTExplainer = BNTExplainer;
})(window);
