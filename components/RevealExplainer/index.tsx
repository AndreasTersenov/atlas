"use client";

// <RevealExplainer> — scrollytelling wrapper around Andreas's vanilla-JS
// Canvas explainers from his Reveal.js talks (G.1.c.2).
//
// The explainers expect a Reveal-style host: they call `Reveal.on(event, …)`
// for `fragmentshown` / `fragmenthidden`, plus they READ DOM state set by
// Reveal — specifically, they count `.bnt-frag.visible` elements inside
// their section to derive the current act. The original `bnt_explainer.js`
// lines 1108–1117 do this verbatim (see V2_PLAN_REVIEW.md §1.1 + §3).
//
// So this wrapper is a *fragment-state DOM emulator*, not just an event
// stub. It:
//
//   1. Renders the section + `acts-1` `<span class="bnt-frag">` markers
//      the explainer expects to find.
//   2. Dynamically loads the explainer's JS+CSS from
//      `${basePath}/explainers/<module>.{js,css}`. The basePath prefix is
//      the load-bearing piece for GH-Pages parity — these URLs bypass
//      Next's automatic <Link>/router rewriting.
//   3. Stubs `window.Reveal` with the minimum API the explainers use:
//      `on/emit/isReady/getCurrentSlide`. Listeners are stored in a Map.
//   4. Calls `window[attach].attach(stubReveal)` once the JS loads, then
//      synchronously emits `ready` so the explainer can do its first sync.
//   5. Tracks the "current act" in React state. When it changes, the
//      wrapper toggles `.visible` on the first `act-1` markers (matching
//      Reveal's behavior as fragments advance) and emits `fragmentshown`.
//      The explainer's poller picks up the new DOM state and updates its
//      canvas / DOM accordingly.
//   6. Drives the act state from an IntersectionObserver on <Beat n={N}>
//      children — when beat N scrolls into view, current act becomes N.
//   7. Prev/next buttons jump acts directly (with the same emit sequence)
//      and scroll the matching Beat into view so the IO state doesn't
//      fight the buttons.
//
// Deliberately deferred to G.1.c.3 (alongside the real bnt_explainer port):
//   - aria-live caption mirror: needs a way to read the engine's current
//     caption text, which varies per engine (bnt_explainer exposes
//     ACT_COPY[act].cap).
//   - prefers-reduced-motion: the smoothing tween lives inside each
//     engine's render loop; toggling it requires reaching into the engine.
//   - Mobile autoplay fallback: depends on the engine exposing an
//     autoplay() method.

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_ATLAS_BASE_PATH ?? "";

// Minimal Reveal API the existing explainers use. We can grow this as
// future explainers need more — current scope is what bnt_explainer.js,
// neural_summaries.js, sbi_pipeline.js, and tomography.js call.
type RevealHandler = (...args: unknown[]) => void;

interface RevealStub {
  on(event: string, handler: RevealHandler): void;
  emit(event: string, ...args: unknown[]): void;
  isReady(): boolean;
  getCurrentSlide(): HTMLElement | null;
}

// `attach` is exported by the explainer on `window.<Name>`. We don't know
// the exact shape at compile time so it's an opaque function call.
interface AttachableExplainer {
  attach(reveal: RevealStub): void;
}

// Window augmentation — explainers attach themselves to globals like
// `window.BNTExplainer`, `window.SmokeExplainer`, etc.
declare global {
  interface Window {
    [k: string]: unknown;
  }
}

export interface RevealExplainerProps {
  /** File stem under public/explainers/ — loads `${basePath}/explainers/<module>.{js,css}`. */
  module: string;
  /** Global key on window holding the explainer's attach() — e.g. "BNTExplainer". */
  attach: string;
  /** `data-bnt-kind` value the explainer uses to select its engine. */
  kind: string;
  /** Total number of scroll-anchored acts. Matches the count of `<Beat>` children. */
  acts: number;
  /** Children — typically a list of `<Beat n={…}>` blocks for scrollytelling. */
  children?: ReactNode;
  /** Optional className for the outer layout container (test page uses this). */
  className?: string;
}

type LoadStatus = "loading" | "ready" | "failed";

export default function RevealExplainer({
  module: moduleName,
  attach: attachName,
  kind,
  acts,
  children,
  className,
}: RevealExplainerProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const proseRef = useRef<HTMLDivElement | null>(null);
  const stubRef = useRef<RevealStub | null>(null);
  const listenersRef = useRef<Map<string, Set<RevealHandler>>>(new Map());

  const [status, setStatus] = useState<LoadStatus>("loading");
  // Current act is 1..acts. Always at least 1 (the explainer expects an
  // initial render at act 1).
  const [act, setAct] = useState<number>(1);

  const jsUrl = `${BASE_PATH}/explainers/${moduleName}.js`;
  const cssUrl = `${BASE_PATH}/explainers/${moduleName}.css`;

  // Build the Reveal stub once. Listeners go through a Map so emit() can
  // dispatch to any number of subscribers — same shape as the original
  // Reveal API.
  const ensureStub = useCallback((): RevealStub => {
    if (stubRef.current) return stubRef.current;
    const listeners = listenersRef.current;
    const stub: RevealStub = {
      on(event, handler) {
        const set = listeners.get(event) ?? new Set();
        set.add(handler);
        listeners.set(event, set);
      },
      emit(event, ...args) {
        const set = listeners.get(event);
        if (!set) return;
        set.forEach((h) => h(...args));
      },
      isReady() {
        return status === "ready";
      },
      getCurrentSlide() {
        return sectionRef.current;
      },
    };
    stubRef.current = stub;
    return stub;
  }, [status]);

  // Toggle `.visible` on the first (act - 1) fragment markers to mirror
  // Reveal's fragment-advance behavior. Then fire `fragmentshown` so the
  // explainer's poller re-reads the DOM. The handler in bnt_explainer
  // doesn't distinguish direction — it just re-counts.
  const syncFragments = useCallback(
    (targetAct: number) => {
      const section = sectionRef.current;
      if (!section) return;
      const frags = section.querySelectorAll<HTMLElement>(".bnt-frag");
      const visibleCount = Math.max(0, Math.min(acts - 1, targetAct - 1));
      frags.forEach((f, i) => {
        f.classList.toggle("visible", i < visibleCount);
      });
      stubRef.current?.emit("fragmentshown");
    },
    [acts]
  );

  // Load CSS + JS in parallel, then attach. We inject <link> and <script>
  // tags directly so the URLs can carry the basePath prefix that
  // <next/script> / <next/image>-style helpers don't apply to bare paths.
  useEffect(() => {
    let cancelled = false;
    // Snapshot the ref so cleanup uses the same instance (lint catches
    // the future-rerender drift case).
    const listeners = listenersRef.current;

    const head = document.head;

    // CSS first — non-blocking but starts the request.
    const linkId = `reveal-explainer-css-${moduleName}`;
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = cssUrl;
      head.appendChild(link);
    }

    // JS: append a <script> with onload/onerror. If the same script tag
    // already exists (from a previous mount), reuse it.
    const scriptId = `reveal-explainer-js-${moduleName}`;
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const onLoaded = () => {
      if (cancelled) return;
      const explainer = window[attachName] as AttachableExplainer | undefined;
      if (!explainer || typeof explainer.attach !== "function") {
        console.error(
          `[RevealExplainer] window.${attachName} is missing or has no attach() after loading ${jsUrl}`
        );
        setStatus("failed");
        return;
      }
      const stub = ensureStub();
      explainer.attach(stub);
      // Synchronously fire ready so the explainer's first sync can run.
      // bnt_explainer's _syncFromReveal will then poll for `.visible`
      // fragments — we haven't toggled any yet (act = 1, visibleCount = 0)
      // which puts the engine at act 1. Correct initial state.
      stub.emit("ready");
      setStatus("ready");
    };

    const onError = () => {
      if (cancelled) return;
      console.error(`[RevealExplainer] Failed to load ${jsUrl}`);
      setStatus("failed");
    };

    if (script) {
      // Already loaded — call attach now.
      if (window[attachName]) {
        queueMicrotask(onLoaded);
      } else {
        script.addEventListener("load", onLoaded, { once: true });
        script.addEventListener("error", onError, { once: true });
      }
    } else {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = jsUrl;
      script.async = true;
      script.addEventListener("load", onLoaded, { once: true });
      script.addEventListener("error", onError, { once: true });
      head.appendChild(script);
    }

    return () => {
      cancelled = true;
      // Listeners cleanup — drop our listener map so a remount starts fresh.
      // We don't remove the <link>/<script> tags: leaving them caches the
      // resource across remounts (HMR, test reload). Cheap and correct.
      listeners.clear();
      stubRef.current = null;
    };
  }, [moduleName, attachName, jsUrl, cssUrl, ensureStub]);

  // After the act state changes (whether driven by scroll, button, or
  // initial mount), sync the fragment DOM.
  useEffect(() => {
    if (status !== "ready") return;
    syncFragments(act);
  }, [act, status, syncFragments]);

  // Drive act state from IntersectionObserver on <Beat n={N}> children.
  // The observer triggers when ~50% of a beat is in view; the most-recent
  // intersecting beat wins.
  useEffect(() => {
    const prose = proseRef.current;
    if (!prose) return;
    const beats = Array.from(
      prose.querySelectorAll<HTMLElement>("[data-beat-n]")
    );
    if (beats.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        // Find the beat whose center sits highest in the viewport (smallest
        // top of intersectionRect). Acts advance monotonically as scroll
        // proceeds, so we want the topmost actively-visible beat.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.target.getBoundingClientRect().top -
              b.target.getBoundingClientRect().top
          );
        if (visible.length === 0) return;
        const top = visible[0].target as HTMLElement;
        const n = Number(top.getAttribute("data-beat-n"));
        if (!Number.isFinite(n)) return;
        setAct((cur) => (cur === n ? cur : Math.max(1, Math.min(acts, n))));
      },
      {
        // Trigger zone: center 60% of the viewport. Tweak in G.1.c.3
        // alongside real content if the feel is off.
        rootMargin: "-20% 0px -20% 0px",
        threshold: 0.0,
      }
    );

    beats.forEach((b) => io.observe(b));
    return () => io.disconnect();
  }, [acts, children]);

  // Manual nav (prev/next) clamps to [1, acts] and scrolls the matching
  // beat into view so the IntersectionObserver doesn't immediately reset
  // us to a different act.
  const goToAct = useCallback(
    (next: number) => {
      const clamped = Math.max(1, Math.min(acts, next));
      setAct(clamped);
      const prose = proseRef.current;
      if (!prose) return;
      const target = prose.querySelector<HTMLElement>(
        `[data-beat-n="${clamped}"]`
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [acts]
  );

  // Render `acts - 1` fragment markers. Reveal's convention: N fragments
  // = N+1 acts (act 1 = no fragments visible, act N+1 = all visible).
  const fragmentMarkers = useMemo(
    () =>
      Array.from({ length: Math.max(0, acts - 1) }, (_, i) => (
        <span
          key={i}
          className="bnt-frag"
          data-bnt-act={i + 2}
          aria-hidden="true"
        />
      )),
    [acts]
  );

  // Beats: only direct children with `data-beat-n` actually drive acts.
  // Validate the count vs `acts` in dev so authors notice a mismatch.
  const beatChildren = useMemo(() => {
    if (process.env.NODE_ENV !== "production") {
      const count = Children.toArray(children).filter(
        (c) =>
          isValidElement(c) &&
          typeof c.props === "object" &&
          c.props !== null &&
          "data-beat-n" in c.props
      ).length;
      if (count !== 0 && count !== acts) {
        console.warn(
          `[RevealExplainer] kind=${kind}: acts={${acts}} but ${count} <Beat> children found`
        );
      }
    }
    return children;
  }, [children, acts, kind]);

  return (
    <div className={`reveal-explainer ${className ?? ""}`}>
      <aside className="reveal-explainer-viz">
        <section
          ref={sectionRef}
          data-bnt-explainer="true"
          data-bnt-kind={kind}
          className="reveal-explainer-section"
        >
          {/* Visible content the explainer paints into. For the smoke
              fixture this is a single number; real explainers paint a
              <canvas> and other DOM. */}
          <span data-role="smoke-act">1</span>
          {fragmentMarkers}
        </section>

        {status === "failed" && (
          <aside role="status" className="reveal-explainer-fallback">
            Interactive viz unavailable. Static description follows.
          </aside>
        )}

        <div className="reveal-explainer-controls" role="group" aria-label="Explainer acts">
          <button
            type="button"
            onClick={() => goToAct(act - 1)}
            disabled={act <= 1}
            aria-label="Previous act"
          >
            ← act
          </button>
          <span aria-live="polite" data-role="act-counter">
            {act} / {acts}
          </span>
          <button
            type="button"
            onClick={() => goToAct(act + 1)}
            disabled={act >= acts}
            aria-label="Next act"
          >
            act →
          </button>
        </div>
      </aside>

      <div ref={proseRef} className="reveal-explainer-prose">
        {beatChildren}
      </div>
    </div>
  );
}

// <Beat n={N}>…</Beat> — wraps prose that, when scrolled into view,
// advances the explainer to act N. Exported alongside the wrapper.
export function Beat({
  n,
  children,
}: {
  n: number;
  children: ReactNode;
}) {
  return (
    <section data-beat-n={n} className="reveal-explainer-beat">
      {children}
    </section>
  );
}
