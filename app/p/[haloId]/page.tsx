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

export default async function HaloPage({ params }: PageProps) {
  const { haloId } = await params;

  // Dynamic import resolved at build time per halo. Webpack/Turbopack
  // create a context module covering content/halos/*.mdx; the bundler
  // emits one chunk per matched file.
  let mod: { default: React.ComponentType; frontmatter: unknown };
  try {
    mod = await import(`@/content/halos/${haloId}.mdx`);
  } catch {
    notFound();
  }

  const fm = HaloFrontmatter.parse(mod.frontmatter);
  const Body = mod.default;

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
