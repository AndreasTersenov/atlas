// Verification route for the REAL bnt_explainer.js port — G.1.c.3.a.
//
// Mounts `<RevealExplainer module="bnt_explainer" attach="BNTExplainer">`
// against the actual canvas explainer Andreas wrote for the NonGaussian
// Universe 2026 talk. The Playwright test in tests/e2e/bnt-port.spec.ts
// asserts the script loads, a <canvas> is created inside the section by
// the engine constructor, and no console errors fire on mount. Visual
// fidelity (does the cloud animate? does scrolling advance the engine?)
// is verified by running `npm run dev` locally and watching the canvas.
//
// Gated on ATLAS_TEST_ROUTES=1 like /smoke/explainer.

import RevealExplainer, { Beat } from "@/components/RevealExplainer";
import { BNTCloudSection } from "@/components/BNTExplainer/sections";

const ACTS = 5;
const TEST_ENABLED = process.env.ATLAS_TEST_ROUTES === "1";

export const metadata = {
  title: "bnt_explainer port verification",
  robots: { index: false, follow: false },
};

export default function BntPortVerifyPage() {
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
            bnt_explainer port — cloud engine
          </h1>
          <p className="mt-2 text-sm text-[#A878B0]">
            Real canvas explainer, port-verification harness. G.1.c.3.b wires
            this into the bnt-cnn halo page with all three engines (cloud,
            mechanism, twopoint).
          </p>
        </header>

        <RevealExplainer
          module="bnt_explainer"
          attach="BNTExplainer"
          kind="cloud"
          acts={ACTS}
          sectionClassName="bnt-slide"
          sectionContent={<BNTCloudSection />}
        >
          <Beat n={1}>
            <p>Beat 1 — four maps → a fixed cloud of pixels in channel space.</p>
          </Beat>
          <Beat n={2}>
            <p>Beat 2 — BNT shears the measuring axes. The cloud doesn&apos;t move.</p>
          </Beat>
          <Beat n={3}>
            <p>Beat 3 — cosmology lives in the cloud&apos;s shape, not in 1D shadows.</p>
          </Beat>
          <Beat n={4}>
            <p>Beat 4 — CNN mixes channels and draws its own axis back along the cloud.</p>
          </Beat>
          <Beat n={5}>
            <p>Beat 5 — whitening rotates to a different clean frame; FoM recovers.</p>
          </Beat>
        </RevealExplainer>
      </div>
    </main>
  );
}
