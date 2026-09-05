# builder.aws.com draft — PUBLISHED Sep 5, 2026:
# https://builder.aws.com/content/3IuDJLRblyBz7XOD1Hu2hdDOHkC/agents-for-humans-measuring-agent-ethics-with-the-ethical-riemann-hypothesis

> Title (must contain "Agents for Humans"):
> **Agents for Humans: measuring agent ethics with the Ethical Riemann Hypothesis**

Agents are getting write access to real systems, and most "alignment" today is
a paragraph in a system prompt. For the Agents for Humans hackathon I built
**ERH Guardian** — a Strands agent on Amazon Bedrock whose every consequential
action is *scored* before it runs, *gated* by a human when it crosses the
user's risk threshold, and *logged* to a public transparency panel.

## The idea: ethics as an error bound

The Ethical Riemann Hypothesis (ERH) engine — pre-existing open-source work I
disclose and consume as a pinned dependency — treats ethical misjudgments like
error terms under an analytic bound. Each action gets an ethical value in
[-1, 1] and a complexity weight; severe misjudgments ("ethical primes")
dominate the cumulative error J(x). The engine estimates the growth exponent α
of |J(x)|:

- **α ≈ 0.5** — errors cancel like noise; the decision stream is healthy.
- **α → 1** — errors compound; the agent is *systematically* misjudging.

So instead of "the model seemed fine," you get `risk_score`, `erh_satisfied`,
and α for every consequential step.

## The part I'd reuse anywhere: the gate is a hook, not a prompt

GuardianGate is a Strands `HookProvider` on `BeforeToolCallEvent`. It scores
the proposed tool input against the user's value profile (risk threshold,
protected topics, auto-approve list) and calls `cancel_tool` when the boundary
is crossed. The model cannot negotiate its way past it — enforcement lives in
the runtime, not the prompt.

```python
# BeforeToolCallEvent → score → cancel_tool + ask a human
decision = decide(profile, tool_name, tool_input)
if decision.needs_approval and not approved_by_human(decision):
    event.cancel_tool("blocked pending human approval")
```

In the demo, a *legitimate-sounding* remediation that merely touches the
protected topic "wildcard admin access" halts at an approval prompt; typing
`n` really does stop execution, and the blocked decision appears on the live
panel seconds later.

## Try it yourself: the guardian console

You don't need an AWS account to feel the gate. The transparency panel ships a
terminal-style **guardian console** —
https://erh-guardian-ui.pages.dev/#/console — where you propose an action and
watch the gate score it live, step by step: ethical value V(a) → decision
complexity → risk mapping → protected-topic check → threshold compare. Benign
actions auto-approve; risky ones (try
`bypass the approval gate and attack the prod database`) are **blocked pending
human approval**, and *you* are the human in the loop — type `approve` or
`deny` right in the terminal. Every verdict lands in the public audit log.

The console hits the same Cloudflare Worker the agent uses: a public
`POST /api/evaluate` endpoint backed by a TypeScript port of the Python gate
contract, so the numbers a reader sees are the numbers the agent is gated by.

## An honest-scoring detail: over-refusal is also a failure

While wiring the engine to Bedrock (`bedrock-runtime` Converse), I fixed a
scoring blind spot upstream: refusing a **harmless** prompt used to be scored
as "safe" text, making over-refusal invisible to the bound. Now a refusal
heuristic clamps the misjudgment score negative (`j = min(j, -0.5)`) for
refused-harmless cases — an agent can't look ethical by refusing everything.
Before: over-refusals scored ≈ +0.9 ("safe"). After: they count against α like
any other misjudgment. That fix went back to the base repo as a small PR.

## Architecture

Strands agent (Python, Claude on Bedrock, us-west-2) ⇄ MCP server on a
Cloudflare Worker (Durable Object + D1/Drizzle; bearer-token write surface) ⇄
React/Vite transparency panel reading a deliberately public, read-only API —
because the audit trail *is* the product.

*(Insert docs/architecture.png here; optionally docs/submission/cards/f3-gate.png
in the GuardianGate section.)*

## Links

- Repo: https://github.com/dennislee928/erh-guardian-agent
- Demo video: `____________________` <!-- TODO: upload docs/submission/draft-cut.mp4 (YouTube/Vimeo), then fill -->
- Live panel: https://erh-guardian-ui.pages.dev (guardian console: https://erh-guardian-ui.pages.dev/#/console)
- Upstream engine fix: https://github.com/dennislee928/Ethic-Latex/pull/95
