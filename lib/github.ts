// Server-only GitHub REST API helpers. Uses the GITHUB_PAT env var (classic
// PAT with `repo` scope) for authentication. Never imported from client code —
// the token must not reach the browser.
//
// We hand-roll fetch against three endpoints (user/repos, repo/commits,
// repo/issues) rather than pulling in octokit because the surface is tiny and
// single-user. Add octokit when we hit pagination, rate-limit handling, or
// multi-user OAuth (v2+).

const GITHUB_API = "https://api.github.com";
const ACCEPT_HEADER = "application/vnd.github+json";
const API_VERSION = "2022-11-28";

// Cache GitHub responses for 60s. Single user, generous 5000/hr rate limit —
// this is for "don't refetch on every router.refresh()", not for cost control.
const REVALIDATE_SECONDS = 60;

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    throw new Error(
      "GITHUB_PAT is not set. Add a classic PAT with `repo` scope to .env.local."
    );
  }
  return {
    Accept: ACCEPT_HEADER,
    "X-GitHub-Api-Version": API_VERSION,
    Authorization: `Bearer ${token}`,
  };
}

async function ghFetch(path: string): Promise<unknown> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: authHeaders(),
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Repos ───────────────────────────────────────────────────────────────

export interface GitHubRepo {
  full_name: string;
  description: string | null;
  pushed_at: string;
  html_url: string;
  private: boolean;
}

interface RawRepo {
  full_name: string;
  description: string | null;
  pushed_at: string;
  html_url: string;
  private: boolean;
}

export async function listMyRepos(): Promise<GitHubRepo[]> {
  // sort=pushed surfaces recently-active repos first, which is what a user
  // configuring an integration usually wants. per_page=100 is the max; we
  // accept the single-page truncation in v1 (5+ years of repos would still
  // fit for most users; if not, paginate later).
  const data = (await ghFetch(
    "/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator"
  )) as RawRepo[];
  return data.map((r) => ({
    full_name: r.full_name,
    description: r.description,
    pushed_at: r.pushed_at,
    html_url: r.html_url,
    private: r.private,
  }));
}

// ── Activity feed ───────────────────────────────────────────────────────

export type ActivityKind = "commit" | "pull_request" | "issue";

export interface ActivityItem {
  kind: ActivityKind;
  repo: string; // "owner/name"
  title: string;
  url: string;
  timestamp: string; // ISO 8601
  author: string | null;
  // Identifier for the row key + display: SHA prefix for commits, #N for
  // PRs / issues.
  ref: string;
}

interface RawCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name?: string; date: string } | null;
  };
  author: { login?: string } | null;
}

interface RawIssue {
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  user: { login?: string } | null;
  pull_request?: unknown; // present iff this issue is actually a PR
}

const PER_REPO_COMMITS = 10;
const TOTAL_FEED_CAP = 25;

async function fetchRepoCommits(repo: string): Promise<ActivityItem[]> {
  const data = (await ghFetch(
    `/repos/${repo}/commits?per_page=${PER_REPO_COMMITS}`
  )) as RawCommit[];
  return data.map((c) => ({
    kind: "commit" as const,
    repo,
    title: c.commit.message.split("\n")[0],
    url: c.html_url,
    timestamp: c.commit.author?.date ?? new Date(0).toISOString(),
    author: c.author?.login ?? c.commit.author?.name ?? null,
    ref: c.sha.slice(0, 7),
  }));
}

async function fetchRepoIssuesAndPrs(repo: string): Promise<ActivityItem[]> {
  // /repos/{r}/issues returns both issues and PRs (GitHub treats PRs as a
  // subtype of issue); distinguish by the presence of `pull_request`.
  const data = (await ghFetch(
    `/repos/${repo}/issues?state=open&per_page=20&sort=updated`
  )) as RawIssue[];
  return data.map((i) => ({
    kind: (i.pull_request ? "pull_request" : "issue") as ActivityKind,
    repo,
    title: i.title,
    url: i.html_url,
    timestamp: i.updated_at,
    author: i.user?.login ?? null,
    ref: `#${i.number}`,
  }));
}

export async function getRepoActivity(
  repos: string[]
): Promise<ActivityItem[]> {
  if (repos.length === 0) return [];

  // Fan out per repo, two calls each. Promise.all is fine for v1 — at 3 repos
  // we issue 6 parallel calls, no need for a concurrency limiter.
  const results = await Promise.all(
    repos.flatMap((r) => [fetchRepoCommits(r), fetchRepoIssuesAndPrs(r)])
  );

  const merged = results.flat();
  merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return merged.slice(0, TOTAL_FEED_CAP);
}
