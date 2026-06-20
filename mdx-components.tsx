// Global MDX components for Atlas v2. Required by @next/mdx with App Router —
// see node_modules/next/dist/docs/01-app/02-guides/mdx.md §"Add an
// mdx-components.tsx file".
//
// The only override here is `img`: MDX raw <img src="/figures/…"> tags
// bypass Next's automatic basePath rewriting (it only applies to
// next/image, <Link>, and router.push). Without this mapper, those URLs
// silently 404 only on the GitHub Pages target — Vercel still serves
// them because Vercel doesn't have a basePath. See
// docs/V2_SHOWCASE_PLAN.md §H and docs/V2_PLAN_REVIEW.md §1.5.

import type { MDXComponents } from "mdx/types";

const BASE_PATH = process.env.NEXT_PUBLIC_ATLAS_BASE_PATH ?? "";

function withBasePath(src: string): string {
  // Only prefix same-origin absolute paths ("/foo/bar.png"). External URLs
  // (https://…) and relative paths (./foo, ../foo) pass through unchanged.
  if (!src.startsWith("/") || src.startsWith("//")) return src;
  return `${BASE_PATH}${src}`;
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    img: ({ src, alt, ...rest }) => {
      const finalSrc = typeof src === "string" ? withBasePath(src) : src;
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={finalSrc as string} alt={alt ?? ""} {...rest} />;
    },
  };
}
