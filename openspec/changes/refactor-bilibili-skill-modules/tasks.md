## 1. Skill architecture and documentation
- [x] 1.1 Audit the current `skills/bilibili-api-skill` bundle and map existing runtime capabilities to the target modules: overview, init, product, video-candidate-pool, outreach-plan, and inbox-follow-up.
- [x] 1.2 Refactor the main `SKILL.md` into a routed entry skill that explains stage order, module handoffs, and guarded high-risk actions.
- [x] 1.3 Add the new submodule/reference assets so each module exposes only its own responsibilities, assets, and recommended commands.

## 2. Candidate-video pool collection
- [x] 2.1 Extend `scripts/bilibili-mcp-lite.mjs` with a collection-oriented command that accepts multiple keywords, per-keyword page limits, page size up to 20, and target candidate counts.
- [x] 2.2 Build in randomized pacing for collection requests, including 5-10 second waits between pages and bounded pauses between keywords, plus explicit handling for search-side risk responses.
- [x] 2.3 Define and implement the candidate-pool persistence format with deduplication by `bvid`, source keyword tracking, pool statuses, and support for user-supplied BVID seeds.

## 3. Candidate scoring and pool merging
- [x] 3.1 Implement 90-day filtering and keyword-local relative scoring based on freshness, comment strength, play strength, interaction efficiency, and keyword relevance.
- [x] 3.2 Add a merge step that preserves per-keyword scoring context while producing a reusable combined execution pool.
- [x] 3.3 Verify that cold-keyword and broad-keyword cases both produce usable ranked candidates without relying on one global absolute threshold.

## 4. Outreach and follow-up module split
- [x] 4.1 Rework the outreach-plan guidance and runtime flow so normal execution consumes the prepared candidate pool instead of issuing repeated live search.
- [x] 4.2 Separate inbox/private-message follow-up into its own module and unread-driven loop that checks unread private messages and unread comment replies before fetching deeper detail.
- [x] 4.3 Define the lead handoff and intent-grading hooks so medium-intent and high-intent paths drive different reply and DM escalation behaviors.

## 5. Verification and rollout
- [x] 5.1 Validate the modular flow against the existing product, campaign, watch, inbox, and thread runtime paths without breaking current script entry points.
- [x] 5.2 Review the updated bundle for progressive disclosure, operator clarity, and risk boundaries, especially around direct send and repeated search actions.
- [x] 5.3 Run targeted smoke checks for the new collector flow and module routing, then document the recommended propose/apply path for the next implementation step.
