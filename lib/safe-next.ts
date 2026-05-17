// Sanitises a `next` query param before using it as a redirect target.
//
// Without this, `?next=https://evil.com` would survive end-to-end:
//   - sign-in page → `emailRedirectTo: "${origin}/auth/callback?next=https://evil.com"`
//   - callback   → `new URL("https://evil.com", origin)` → resolves to evil.com
// That's an open-redirect vulnerability (CWE-601). We accept only relative
// paths starting with a single `/` and reject protocol-relative URLs (`//evil`).

const FALLBACK = "/cockpit";

export function safeNext(
  next: string | null | undefined,
  fallback: string = FALLBACK
): string {
  if (!next) return fallback;
  // Must be a same-origin absolute path: `/foo` or `/foo/bar?x=1#hash`.
  // Reject anything that looks like a network-path reference (`//host/...`)
  // or carries a scheme (`http:`, `javascript:`, ...). Backslashes are
  // rejected because some URL parsers normalise `\` to `/`, which can be
  // used to smuggle a host past a naive startsWith("/") check.
  if (
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\") ||
    next.includes("\\")
  ) {
    return fallback;
  }
  return next;
}
