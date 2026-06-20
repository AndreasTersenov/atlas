<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Working agreement (autonomous-development guardrails)

For substantive work — anything beyond a one-line fix:

1. **Draft → adversarial review → iterate.** Author plans or non-trivial code as Claude A (you). Then spawn a fresh agent via the Agent tool — `feature-dev:code-reviewer` for code, `claude` with a staff-engineer brief for plans/architecture — and ask it to review *as a senior staff engineer doing PR review: find problems, challenge assumptions, demand evidence I haven't supplied.* Fold real findings into the work before shipping. Surface unresolved findings to Andreas with your call on each.

2. **Tests are not optional.** New features ship with tests. Stack: `vitest` for units/integration, `@playwright/test` for UI flows. Write them alongside or before the feature. Run them. Iterate until green. Failing tests are not "to be addressed later" — they're the work.

3. **Evidence over assertion.** Every "done" claim includes a verifiable artifact:
   - For code: the command run + its output (test pass, lint clean, `npm run build` success — tail it into the response, don't summarise).
   - For UI: a screenshot from Playwright headed mode or the local browser.
   - For a deploy: a curl response + status code from the live URL.
   - For a DB change: a row count + a sample row query result.
   - Never "this should work" / "I implemented it" / "should be ready." Show it.

4. **Audit prior claims before building on them.** Don't assume the last session's "verified" actually was. Re-run the test, re-curl the endpoint, re-query Supabase. The HANDOFF doc is a snapshot, not ground truth — ground truth is what `gh pr view`, `git status`, and tool output say *right now*.

5. **One open question deserves one direct recommendation.** When the work surfaces a decision Andreas needs to make, surface it with your recommendation and the trade-off — not a survey of options. He'll redirect if he wants something else.
