// /p/[haloId] — per-halo public detail page.
//
// Static export only: generateStaticParams reads the content/halos/
// directory at build time, the dynamic-segment value is awaited per Next 16,
// and unknown halos 404 via `dynamicParams = false`. The page body is
// rendered from the per-halo .mdx file's default export; frontmatter is
// validated with the zod schema in lib/halo-content.ts.

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  HaloFrontmatter,
  listMdxHaloIds,
  type HaloLink as HaloLinkT,
} from "@/lib/halo-content";

export const dynamicParams = false;

export async function generateStaticParams() {
  const ids = await listMdxHaloIds();
  return ids.map((haloId) => ({ haloId }));
}

interface PageProps {
  params: Promise<{ haloId: string }>;
}

/**
 * Loads + validates the MDX module for a given haloId. Used by both
 * generateMetadata and the page body so they can't drift.
 *
 * Dynamic import constraint (don't refactor without reading): the
 * variable portion of the template literal must remain a bare identifier.
 * Webpack and Turbopack statically analyse this expression at build time
 * to enumerate all matching files (`content/halos/*.mdx`) and form a
 * context module. Wrapping `haloId` in a function call or conditional
 * breaks the static analysis and either oversizes the chunk or fails the
 * build with a `Module not found` error.
 */
async function loadHaloModule(haloId: string): Promise<{
  Body: React.ComponentType;
  fm: ReturnType<typeof HaloFrontmatter.parse>;
} | null> {
  let mod: { default: React.ComponentType; frontmatter: unknown };
  try {
    mod = await import(`@/content/halos/${haloId}.mdx`);
  } catch {
    return null;
  }

  // safeParse so the failing halo is named in the build output instead of
  // a raw ZodError with no attribution.
  const fmResult = HaloFrontmatter.safeParse(mod.frontmatter);
  if (!fmResult.success) {
    throw new Error(
      `[/p/${haloId}] frontmatter failed zod validation:\n${fmResult.error.message}`
    );
  }
  const fm = fmResult.data;

  // Coherence between filename and frontmatter halo_id. Without this,
  // a copy-pasted MDX where the file was renamed but the frontmatter
  // wasn't would silently render the wrong title/links under the new
  // URL. Caught at build time per generated path.
  if (fm.halo_id !== haloId) {
    throw new Error(
      `[/p/${haloId}] frontmatter halo_id is "${fm.halo_id}" but the MDX ` +
        `file was loaded as "${haloId}". Rename the file or fix the ` +
        `frontmatter so they agree. See V2_SHOWCASE_PLAN §I.`
    );
  }

  return { Body: mod.default, fm };
}

export async function generateMetadata({ params }: PageProps) {
  const { haloId } = await params;
  const loaded = await loadHaloModule(haloId);
  if (!loaded) return {};
  return {
    title: loaded.fm.title,
    description: loaded.fm.tagline,
  };
}

export default async function HaloPage({ params }: PageProps) {
  const { haloId } = await params;
  const loaded = await loadHaloModule(haloId);
  if (!loaded) notFound();
  // notFound() returns `never`, so TS narrows `loaded` to non-null here —
  // no `!` assertion needed.
  const { Body, fm } = loaded;

  return (
    <main className="min-h-dvh bg-[#0A0214] text-[#E8D6F4]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <nav className="mb-8 text-xs">
          <Link
            href="/"
            className="rounded-md border border-[#3F2570]/50 bg-[#13062A]/70 px-3 py-1.5 font-mono text-[#A878B0] backdrop-blur transition-colors hover:border-[#9B6BC4] hover:text-[#E8D6F4]"
          >
            ← map
          </Link>
        </nav>

        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-[#E8D6F4] sm:text-4xl">
            {fm.title}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-[#A878B0]">
            {fm.tagline}
          </p>
          {fm.links.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2 text-xs">
              {fm.links.map((l: HaloLinkT) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-[#3F2570]/60 px-3 py-1.5 font-mono text-[#A878B0] transition-colors hover:border-[#9B6BC4] hover:text-[#E8D6F4]"
                  >
                    {l.label} →
                  </a>
                </li>
              ))}
            </ul>
          )}
        </header>

        <article className="prose-atlas">
          <Body />
        </article>
      </div>
    </main>
  );
}
