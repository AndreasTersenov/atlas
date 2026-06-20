// Smoke test route for <RevealExplainer> — only built when
// ATLAS_TEST_ROUTES=1 is set at build time (the Playwright webServer
// sets this; production CI does not).
//
// Without the env var, this page renders an inert placeholder so
// production builds don't ship a working test harness. With the env
// var, it mounts the wrapper against the `_smoke` synthetic fixture so
// the Playwright suite can exercise the fragment-state emulator end to
// end without needing the real bnt_explainer.js port (that's G.1.c.3).

import RevealExplainer, { Beat } from "@/components/RevealExplainer";

const ACTS = 5;
const TEST_ENABLED = process.env.ATLAS_TEST_ROUTES === "1";

export const metadata = {
  title: "RevealExplainer smoke",
  robots: { index: false, follow: false },
};

export default function SmokeExplainerPage() {
  if (!TEST_ENABLED) {
    return (
      <main className="min-h-dvh bg-[#0A0214] p-8 text-[#E8D6F4]">
        <p className="text-sm text-[#A878B0]">
          This route is reserved for the test harness. Re-run the build with{" "}
          <code>ATLAS_TEST_ROUTES=1</code> to enable it.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#0A0214] text-[#E8D6F4]">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            RevealExplainer smoke
          </h1>
          <p className="mt-2 text-sm text-[#A878B0]">
            Scrolls through 5 acts driven by the `_smoke` synthetic fixture.
            The big number on the left updates as scroll advances acts.
          </p>
        </header>

        <RevealExplainer
          module="_smoke"
          attach="SmokeExplainer"
          kind="smoke"
          acts={ACTS}
        >
          <Beat n={1}>
            <p>Beat 1 — initial state. Act counter should show 1.</p>
          </Beat>
          <Beat n={2}>
            <p>Beat 2 — scroll triggers act 2. Big number flips to 2.</p>
          </Beat>
          <Beat n={3}>
            <p>Beat 3 — act 3.</p>
          </Beat>
          <Beat n={4}>
            <p>Beat 4 — act 4.</p>
          </Beat>
          <Beat n={5}>
            <p>Beat 5 — final act 5. Next button is disabled here.</p>
          </Beat>
        </RevealExplainer>
      </div>
    </main>
  );
}
