## ADDED Requirements

### Requirement: Candidate collection batches keyword searches with built-in pacing
The candidate-video pool SHALL collect videos by running keyword searches in batches through `scripts/bilibili-mcp-lite.mjs`, and the collection workflow SHALL support configurable keyword lists, per-keyword page limits, page size up to 20, target candidate count, and randomized pacing between requests.

#### Scenario: Batch collection across multiple keywords
- **WHEN** a product provides multiple keywords for candidate discovery
- **THEN** the collector searches those keywords sequentially, requests one page at a time, and records which keyword and page produced each video candidate

#### Scenario: Collection pacing protects against repeated rapid search
- **WHEN** the collector requests multiple pages or moves from one keyword to the next
- **THEN** it inserts a randomized wait between 5 and 10 seconds for page-to-page searches and a longer bounded pause for keyword-to-keyword transitions before continuing

### Requirement: Candidate scoring is relative within each keyword cohort
The candidate-video pool SHALL score search results within the result set of each individual keyword rather than using one global absolute threshold, and the scoring model SHALL only consider videos published within the most recent 90 days.

#### Scenario: Cold keyword still yields useful candidates
- **WHEN** a niche keyword returns lower absolute play and comment counts than a broad keyword
- **THEN** the scoring model ranks videos relative to that niche keyword's own cohort so the strongest local candidates remain eligible instead of being discarded by global thresholds

#### Scenario: Older videos are excluded from active candidate scoring
- **WHEN** a search result is older than 90 days
- **THEN** the candidate pool excludes it from active scoring and does not place it into the recommended execution pool by default

### Requirement: Candidate scores reflect comment-driven outreach value
The scoring model SHALL combine freshness, relative comment volume, relative play volume, interaction efficiency, and keyword relevance, and comment-driven signals SHALL carry at least as much weight as play volume because the workflow depends on comment-area engagement.

#### Scenario: High comments outperform raw reach
- **WHEN** two videos from the same keyword cohort have similar freshness but one has materially better comment participation relative to its play volume
- **THEN** the candidate with stronger comment engagement receives the higher recommendation score

#### Scenario: Weak keyword relevance is penalized
- **WHEN** a result has low title, description, or tag relevance to the originating keyword
- **THEN** the scoring model lowers its final score even if the raw traffic metrics are high

### Requirement: Candidate pools are persisted as reusable assets
The candidate-video workflow SHALL deduplicate results by `bvid`, persist merged pool entries with source keywords and score breakdowns, and support externally supplied BVID lists so later outreach plans can consume a stable pool without repeated live search.

#### Scenario: Duplicate BVID appears under multiple keywords
- **WHEN** the same video is returned for more than one keyword
- **THEN** the persisted pool stores one canonical candidate entry, records all matched source keywords, and preserves per-keyword score information

#### Scenario: User provides manual BVID seeds
- **WHEN** a user supplies one or more BVIDs directly
- **THEN** the pool can ingest those seeds alongside search-derived candidates and mark their source as externally provided
