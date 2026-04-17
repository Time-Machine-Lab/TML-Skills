## Context

`skills/bilibili-api-skill` already contains meaningful domain code for products, playbooks, campaigns, discovery, watcher polling, inbox orchestration, and thread continuation, but those capabilities are mostly presented as one flat skill backed by many low-level scripts. The current shape makes it hard for users to understand stage order, and it forces the agent to infer module boundaries that are not explicit in the bundle itself.

This change introduces a spec-first modular architecture without discarding the existing runtime code. The design centers on re-presenting the bundle as a routed skill system, adding a reusable candidate-video pool, and separating public outreach from unread-driven follow-up. The project currently has no `docs/design` system diagrams or project-level API/SQL contracts for this area, so the change is primarily internal to the skill bundle and its runtime state.

## Goals / Non-Goals

**Goals:**
- Turn the Bilibili bundle into a main entry skill plus explicit modules and references that support progressive disclosure.
- Make candidate-video discovery a reusable asset workflow rather than a repeated live-search action inside every outreach step.
- Upgrade `bilibili-mcp-lite.mjs` from single-search utility into a collection-oriented helper that can batch keywords with built-in pacing.
- Ensure candidate scoring works for both broad and cold keywords by using 90-day, keyword-local relative scoring.
- Split public outreach planning from inbox/private-message follow-up so state ownership is clear and risk controls are easier to enforce.

**Non-Goals:**
- Replacing every existing `scripts/lib/*.js` file in one step.
- Designing a full autonomous growth engine that removes all operator judgment.
- Introducing project-level `docs/api` or `docs/sql` contracts for this internal refactor.
- Solving all future third-party BVID source integrations in this first change.

## Decisions

### 1. Use a routed main skill with explicit module surfaces
The bundle will be reorganized around one main skill that routes users into module-specific guidance and assets:

- overview / manual
- init
- product
- video-candidate-pool
- outreach-plan
- inbox-follow-up

This keeps the current runtime code usable while replacing the existing “single flat skill” mental model with a staged product workflow. The alternative was to keep one `SKILL.md` and merely improve prose, but that would still leave the agent inferring too much from free text.

### 2. Treat candidate discovery as a persistent asset, not a live step
The new architecture will insert a candidate-pool layer between product definition and outreach execution:

```text
product -> keywords -> collector -> scored pool -> outreach plan
```

The outreach plan will consume persisted BVID entries instead of calling search for every cycle. The alternative was to leave discovery inside campaign execution and only add rate limits, but that would still couple search risk to execution risk and make audits difficult.

### 3. Upgrade `bilibili-mcp-lite.mjs` as a collection helper, not a full decision engine
`bilibili-mcp-lite.mjs` is a good fit for the collection layer because it already normalizes Bilibili search results into stable fields such as `bvid`, `play_count`, `comment_count`, and `publish_date`. The design keeps it focused on search and collection concerns:

- batch keyword input
- sequential page collection
- randomized pacing between requests
- structured output for downstream scoring

Scoring, deduplication, pool status, and execution decisions will live in the candidate-pool layer, not inside the collector script. The alternative was to embed the full pool strategy directly in the collector, but that would recreate the same monolithic pattern in a new place.

### 4. Score within each keyword cohort, then merge
Cold keywords must not be judged by the same absolute thresholds as broad keywords. The design therefore scores results inside each keyword cohort and only merges candidates after per-keyword scoring is complete. Recommended components:

- freshness within 90 days
- relative comment rank
- relative play rank
- interaction efficiency such as comments relative to plays
- keyword relevance from title/description/tag matches

The merge step deduplicates by `bvid`, records all source keywords, and preserves per-keyword scores. The alternative was one global threshold or one global ranking list, but that would over-favor broad keywords and make niche product terms unusable.

### 5. Split outreach execution from inbox follow-up
Public outreach and private-message/comment follow-up will become two coordinated loops with different triggers:

- outreach-plan loop: consumes BVID pool, runs scheme cadence, creates leads
- inbox-follow-up loop: checks unread private messages and unread comment replies, then fetches deeper context only when activity exists

This separates lead creation from lead handling, keeps unread-triggered polling cheap, and makes escalation policy clearer. The alternative was a single loop that both discovers, sends, and follows up, but that is the pattern that already made the bundle opaque and hard to control.

### 6. Make risk and intent policies explicit module dependencies
The new module surfaces will depend on explicit policy assets instead of burying these decisions in prompt text:

- intent grading policy
- pacing/risk policy
- copy strategy / response guidance

This does not require a standalone implementation module in the first pass, but the design reserves named references or sub-skills so those policies can be read consistently by the outreach and follow-up modules.

## Risks / Trade-offs

- [Risk] More files and modules can feel heavier than the current flat skill. → Mitigation: keep one routed main skill and expose modules progressively rather than asking the user to choose from a large menu up front.
- [Risk] Candidate-pool persistence adds runtime-state complexity. → Mitigation: use a narrow pool schema with canonical `bvid`, source keyword metadata, score breakdowns, and clear status values such as `new`, `approved`, `consumed`, and `blacklisted`.
- [Risk] The collector still depends on Bilibili search endpoints and can hit search-side controls. → Mitigation: bake request pacing into the collection helper and keep live search outside the normal outreach loop.
- [Risk] Keyword-local scoring can surface low-absolute-traffic videos for very cold terms. → Mitigation: keep lightweight floor filters, cap pool size per keyword, and preserve operator review before execution.
- [Risk] Separating outreach and follow-up creates coordination needs between loops. → Mitigation: define a shared lead/event handoff format and keep the follow-up loop unread-driven so it only wakes up when real activity exists.

## Migration Plan

1. Define the module map and artifact structure for the new Bilibili skill bundle.
2. Refactor the existing `SKILL.md` into a routed entry point and add submodule/reference assets without breaking current script paths.
3. Upgrade `bilibili-mcp-lite.mjs` with collection-oriented commands and pacing controls.
4. Add candidate-pool persistence and keyword-local scoring.
5. Rework outreach guidance to consume the pool and reserve live search for explicit refresh steps only.
6. Reframe inbox follow-up around unread-triggered retrieval and documented escalation rules.
7. Validate the new module flow against the existing product/campaign/watch/thread runtime paths before broader rollout.

## Open Questions

- Should the candidate-pool persistence format live under the existing runtime `data` tree or under a new module-specific directory?
- What minimum floor filters should remain global even when scoring is keyword-local?
- Should intent grading be authored as a dedicated reusable policy file in this change, or only be referenced as a reserved module boundary for a follow-up change?
- How much operator review should be required before a freshly collected BVID enters the executable pool by default?
