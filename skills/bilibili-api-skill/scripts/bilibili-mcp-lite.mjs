#!/usr/bin/env node

const HOME_URL = "https://www.bilibili.com";
const API_WEB = "https://api.bilibili.com/x/web-interface";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
  Accept: "*/*",
  Connection: "keep-alive",
  "Accept-Encoding": "gzip, deflate, br",
  "User-Agent": USER_AGENT,
  Referer: HOME_URL,
};

const SEARCH_RISK_CODES = new Set([352, 403, 412, -352, -403, -412]);

function printUsage() {
  process.stdout.write(`Usage:
  node scripts/bilibili-mcp-lite.mjs search --keyword "<关键词>" [--page 1] [--limit 10] [--raw]
  node scripts/bilibili-mcp-lite.mjs collect --keywords "词1,词2" [--pages-per-keyword 2] [--page-size 20] [--target-count 30]

Examples:
  node scripts/bilibili-mcp-lite.mjs search --keyword "洛天依" --page 1 --limit 3
  node scripts/bilibili-mcp-lite.mjs collect --keywords "AI编程,Claude Code" --pages-per-keyword 2 --target-count 20
`);
}

function parseArgs(argv) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (next == null || next.startsWith("--")) {
        options[key] = true;
      } else {
        options[key] = next;
        index += 1;
      }
      continue;
    }
    positionals.push(token);
  }

  return { positionals, options };
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireOption(options, key, message) {
  const value = options[key];
  if (value == null || value === "") {
    throw new Error(message || `Missing required option --${key}`);
  }
  return String(value);
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupe(values) {
  return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function cleanTitle(title) {
  if (!title) {
    return "";
  }
  return String(title).replace(/<em class="keyword">(.*?)<\/em>/g, "$1");
}

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDuration(duration) {
  if (typeof duration === "string") {
    return duration;
  }
  if (typeof duration === "number" && Number.isFinite(duration)) {
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  return "";
}

function formatDate(timestamp) {
  if (!timestamp) {
    return "";
  }
  const date = new Date(Number(timestamp) * 1000);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().split("T")[0];
}

function extractCookiePairs(response) {
  const rawCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  return rawCookies
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean);
}

async function getCookieHeader(url = HOME_URL) {
  const response = await fetch(url, {
    headers: {
      ...DEFAULT_HEADERS,
      Referer: url,
    },
  });

  const cookiePairs = extractCookiePairs(response);
  return cookiePairs.join("; ");
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      ...DEFAULT_HEADERS,
      ...headers,
    },
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${url}`);
    error.code = response.status;
    throw error;
  }

  return response.json();
}

function normalizeSearchVideo(video) {
  return {
    aid: video.aid || video.id || 0,
    bvid: video.bvid || "",
    title: cleanTitle(video.title),
    author: video.author || "",
    author_mid: video.mid || 0,
    category: {
      id: Number.parseInt(video.typeid, 10) || 0,
      name: video.typename || "",
    },
    play_count: Number.parseInt(video.play, 10) || 0,
    like_count: Number.parseInt(video.like, 10) || 0,
    favorite_count: Number.parseInt(video.favorites, 10) || 0,
    comment_count: Number.parseInt(video.review, 10) || 0,
    danmaku_count: Number.parseInt(video.danmaku, 10) || 0,
    duration: video.duration || "",
    publish_date: formatDate(video.pubdate),
    publish_ts: Number(video.pubdate || 0),
    description: stripTags(video.description || ""),
    rank_index: Number.parseInt(video.rank_index, 10) || 0,
    tags: stripTags(video.tag || ""),
    arcurl: video.arcurl ? String(video.arcurl).replace(/^http:\/\//, "https://") : "",
  };
}

function normalizeVideoDetailSeed(data, bvid) {
  const core = data?.data || data || {};
  return {
    aid: core.aid || 0,
    bvid: core.bvid || bvid,
    title: stripTags(core.title || ""),
    author: core.owner?.name || "",
    author_mid: core.owner?.mid || 0,
    category: {
      id: Number(core.tid || 0),
      name: core.tname || "",
    },
    play_count: Number(core.stat?.view || 0),
    like_count: Number(core.stat?.like || 0),
    favorite_count: Number(core.stat?.favorite || 0),
    comment_count: Number(core.stat?.reply || 0),
    danmaku_count: Number(core.stat?.danmaku || 0),
    duration: formatDuration(core.duration || 0),
    publish_date: formatDate(core.pubdate),
    publish_ts: Number(core.pubdate || 0),
    description: stripTags(core.desc || ""),
    rank_index: 0,
    tags: "",
    arcurl: `https://www.bilibili.com/video/${core.bvid || bvid}`,
    manual_seed: true,
  };
}

function randomBetween(min, max) {
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ageDaysFromTimestamp(timestampSec) {
  if (!timestampSec) {
    return Number.POSITIVE_INFINITY;
  }
  const ageMs = Date.now() - Number(timestampSec) * 1000;
  return ageMs / (24 * 60 * 60 * 1000);
}

function percentileScore(index, total) {
  if (total <= 1) {
    return 100;
  }
  return ((total - 1 - index) / (total - 1)) * 100;
}

function buildRankMap(items, selector) {
  const ranked = [...items]
    .map((item) => ({ bvid: item.bvid, metric: Number(selector(item) || 0) }))
    .sort((a, b) => b.metric - a.metric);
  const map = new Map();
  ranked.forEach((item, index) => {
    map.set(item.bvid, {
      rank: index + 1,
      score: percentileScore(index, ranked.length),
      metric: item.metric,
    });
  });
  return map;
}

function buildStats(items) {
  const plays = items.map((item) => Number(item.play_count || 0)).sort((a, b) => a - b);
  const comments = items.map((item) => Number(item.comment_count || 0)).sort((a, b) => a - b);
  const ageDays = items.map((item) => ageDaysFromTimestamp(item.publish_ts)).filter(Number.isFinite).sort((a, b) => a - b);
  const mid = (list) => (list.length ? list[Math.floor(list.length / 2)] : 0);
  return {
    cohortSize: items.length,
    medianPlay: mid(plays),
    medianComments: mid(comments),
    newestAgeDays: ageDays.length ? Number(ageDays[0].toFixed(2)) : 0,
    oldestAgeDays: ageDays.length ? Number(ageDays[ageDays.length - 1].toFixed(2)) : 0,
  };
}

function buildKeywordTerms(keyword) {
  const base = String(keyword || "").trim();
  if (!base) {
    return [];
  }
  const languageAwareTokens = base.match(/[a-z0-9+#._-]{2,}|[\u4e00-\u9fa5]{2,}/gi) || [];
  const tokens = [
    base,
    ...languageAwareTokens,
    ...base
      .split(/[\s/|]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2),
  ];
  return dedupe(tokens);
}

function computeRelevance(video, keyword) {
  const terms = buildKeywordTerms(keyword);
  const title = String(video.title || "").toLowerCase();
  const description = String(video.description || "").toLowerCase();
  const tags = String(video.tags || "").toLowerCase();
  const hits = [];
  const matchedTerms = new Set();
  let score = 0;
  const [exactTerm, ...partialTerms] = terms;
  if (exactTerm && title.includes(exactTerm.toLowerCase())) {
    score += 5;
    hits.push(`title-exact:${exactTerm}`);
    matchedTerms.add(exactTerm);
  } else if (exactTerm && description.includes(exactTerm.toLowerCase())) {
    score += 3;
    hits.push(`desc-exact:${exactTerm}`);
    matchedTerms.add(exactTerm);
  } else if (exactTerm && tags.includes(exactTerm.toLowerCase())) {
    score += 2;
    hits.push(`tag-exact:${exactTerm}`);
    matchedTerms.add(exactTerm);
  }
  for (const term of partialTerms) {
    const source = term.toLowerCase();
    if (title.includes(source)) {
      score += 3;
      hits.push(`title:${term}`);
      matchedTerms.add(term);
      continue;
    }
    if (description.includes(source)) {
      score += 1.5;
      hits.push(`desc:${term}`);
      matchedTerms.add(term);
      continue;
    }
    if (tags.includes(source)) {
      score += 1;
      hits.push(`tag:${term}`);
      matchedTerms.add(term);
    }
  }
  const coverage = terms.length ? matchedTerms.size / terms.length : 0;
  return {
    score: Math.min(Number((score + coverage * 2).toFixed(2)), 10),
    coverage: Number(coverage.toFixed(2)),
    matchedTerms: Array.from(matchedTerms).slice(0, 6),
    hits: hits.slice(0, 6),
  };
}

function freshnessComponent(ageDays, maxAgeDays) {
  if (!Number.isFinite(ageDays) || ageDays > maxAgeDays) {
    return 0;
  }
  if (ageDays <= 15) {
    return 25;
  }
  if (ageDays <= 30) {
    return 21;
  }
  if (ageDays <= 60) {
    return 16;
  }
  return 10;
}

function enrichKeywordCohort(keyword, items, maxAgeDays) {
  const eligible = items.filter((item) => {
    const ageDays = ageDaysFromTimestamp(item.publish_ts);
    return Number.isFinite(ageDays) && ageDays <= maxAgeDays && item.bvid;
  });
  const stats = buildStats(eligible);
  const playRanks = buildRankMap(eligible, (item) => item.play_count);
  const commentRanks = buildRankMap(eligible, (item) => item.comment_count);
  const efficiencyRanks = buildRankMap(eligible, (item) => {
    const plays = Math.max(Number(item.play_count || 0), 1);
    const comments = Number(item.comment_count || 0);
    return comments / plays;
  });

  const scoredItems = eligible
    .map((item) => {
      const ageDays = ageDaysFromTimestamp(item.publish_ts);
      const playRank = playRanks.get(item.bvid) || { rank: 0, score: 0 };
      const commentRank = commentRanks.get(item.bvid) || { rank: 0, score: 0 };
      const efficiencyRank = efficiencyRanks.get(item.bvid) || { rank: 0, score: 0 };
      const relevance = computeRelevance(item, keyword);
      const trafficWeight = relevance.coverage <= 0 ? 0.2 : relevance.coverage < 0.5 ? 0.6 : 1;
      const components = {
        freshness: freshnessComponent(ageDays, maxAgeDays),
        comments: Number((((commentRank.score / 100) * 30) * trafficWeight).toFixed(2)),
        plays: Number((((playRank.score / 100) * 20) * trafficWeight).toFixed(2)),
        efficiency: Number((((efficiencyRank.score / 100) * 15) * trafficWeight).toFixed(2)),
        relevance: relevance.score,
      };
      const total = Number(
        (
          components.freshness +
          components.comments +
          components.plays +
          components.efficiency +
          components.relevance
        ).toFixed(2)
      );
      return {
        ...item,
        age_days: Number(ageDays.toFixed(2)),
        keyword_score: {
          keyword,
          total,
          rank: 0,
          cohort_size: stats.cohortSize,
          components,
          relevance_hits: relevance.hits,
          relevance_coverage: relevance.coverage,
          matched_terms: relevance.matchedTerms,
          stats,
        },
      };
    })
    .sort((a, b) => b.keyword_score.total - a.keyword_score.total);

  const hitCount = scoredItems.filter((item) => Number(item.keyword_score.relevance_coverage || 0) > 0).length;
  const visibleItems =
    hitCount >= 5 ? scoredItems.filter((item) => Number(item.keyword_score.relevance_coverage || 0) > 0) : scoredItems;
  visibleItems.forEach((item, index) => {
    item.keyword_score.rank = index + 1;
  });

  return {
    keyword,
    rawCount: items.length,
    filteredCount: visibleItems.length,
    stats,
    items: visibleItems,
  };
}

function mergeKeywordResults(byKeyword, targetCount) {
  const map = new Map();
  for (const bucket of byKeyword) {
    for (const item of bucket.items || []) {
      const existing = map.get(item.bvid);
      if (!existing) {
        map.set(item.bvid, {
          ...item,
          sourceKeywords: [bucket.keyword],
          keywordScores: {
            [bucket.keyword]: {
              total: item.keyword_score.total,
              rank: item.keyword_score.rank,
              cohortSize: item.keyword_score.cohort_size,
              components: item.keyword_score.components,
              stats: item.keyword_score.stats,
            },
          },
          selectedKeyword: bucket.keyword,
          mergedScore: item.keyword_score.total,
          manualSeed: Boolean(item.manual_seed),
        });
        continue;
      }
      existing.sourceKeywords = dedupe([...(existing.sourceKeywords || []), bucket.keyword]);
      existing.keywordScores = {
        ...(existing.keywordScores || {}),
        [bucket.keyword]: {
          total: item.keyword_score.total,
          rank: item.keyword_score.rank,
          cohortSize: item.keyword_score.cohort_size,
          components: item.keyword_score.components,
          stats: item.keyword_score.stats,
        },
      };
      if (item.keyword_score.total > Number(existing.mergedScore || 0)) {
        existing.selectedKeyword = bucket.keyword;
        existing.mergedScore = item.keyword_score.total;
      }
    }
  }
  const merged = Array.from(map.values()).sort((a, b) => {
    if (Boolean(b.manualSeed) !== Boolean(a.manualSeed)) {
      return Number(Boolean(b.manualSeed)) - Number(Boolean(a.manualSeed));
    }
    return Number(b.mergedScore || 0) - Number(a.mergedScore || 0);
  });
  return merged.slice(0, Math.max(Number(targetCount || merged.length), 1));
}

async function fetchVideoDetailByBvid(bvid, cookieHeader = "") {
  const query = new URLSearchParams({ bvid: String(bvid || "").trim() });
  const payload = await fetchJson(`${API_WEB}/view?${query.toString()}`, {
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    Referer: `https://www.bilibili.com/video/${bvid}`,
  });
  if (payload?.code !== 0) {
    const error = new Error(payload?.message || "Bilibili view failed");
    error.code = payload?.code;
    throw error;
  }
  return normalizeVideoDetailSeed(payload, bvid);
}

async function searchVideos({ keyword, page = 1, limit = 10, raw = false, cookieHeader = "" } = {}) {
  if (!keyword || !String(keyword).trim()) {
    throw new Error("keyword is required");
  }

  const safePage = Math.max(1, toInt(page, 1));
  const safeLimit = Math.min(Math.max(1, toInt(limit, 10)), 20);
  const encodedKeyword = encodeURIComponent(String(keyword).trim());
  const effectiveCookie = cookieHeader || (await getCookieHeader(HOME_URL));
  const searchUrl = `${API_WEB}/search/all/v2?keyword=${encodedKeyword}&page=${safePage}&order=totalrank`;

  const payload = await fetchJson(searchUrl, {
    Cookie: effectiveCookie,
    Referer: `https://search.bilibili.com/all?keyword=${encodedKeyword}`,
  });

  if (payload?.code !== 0) {
    const error = new Error(payload?.message || "Bilibili search failed");
    error.code = payload?.code;
    throw error;
  }

  const videos =
    payload?.data?.result?.find((item) => item.result_type === "video")?.data || [];

  return raw ? videos.slice(0, safeLimit) : videos.map(normalizeSearchVideo).slice(0, safeLimit);
}

async function hydrateManualSeeds(manualBvids, cookieHeader) {
  const items = [];
  const warnings = [];
  for (const bvid of dedupe(manualBvids)) {
    try {
      const detail = await fetchVideoDetailByBvid(bvid, cookieHeader);
      items.push({
        ...detail,
        manual_seed: true,
        sourceKeywords: [],
        keywordScores: {},
        mergedScore: 110,
      });
    } catch (error) {
      warnings.push({
        type: "manual-seed-error",
        bvid,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { items, warnings };
}

function shouldStopOnRisk(error) {
  const code = Number(error?.code || 0);
  return SEARCH_RISK_CODES.has(code) || /(352|403|412|风控|权限不足)/i.test(String(error?.message || ""));
}

export async function collectVideoPool({
  keywords = [],
  pagesPerKeyword = 2,
  pageSize = 20,
  targetCount = 30,
  maxAgeDays = 90,
  minIntervalSec = 5,
  maxIntervalSec = 10,
  keywordPauseMinSec = 8,
  keywordPauseMaxSec = 15,
  manualBvids = [],
} = {}) {
  const dedupedKeywords = dedupe(keywords);
  if (!dedupedKeywords.length && !manualBvids.length) {
    throw new Error("collect requires at least one keyword or manual bvid seed");
  }

  const safePagesPerKeyword = Math.max(1, Math.min(Number(pagesPerKeyword || 2), 10));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 20));
  const safeTargetCount = Math.max(1, Number(targetCount || 30));
  const fetchedAt = new Date().toISOString();
  const cookieHeader = await getCookieHeader(HOME_URL);
  const byKeyword = [];
  const warnings = [];
  const rawCandidates = [];
  let requestCount = 0;
  let stoppedByRisk = false;

  for (let keywordIndex = 0; keywordIndex < dedupedKeywords.length; keywordIndex += 1) {
    if (stoppedByRisk) {
      break;
    }
    const keyword = dedupedKeywords[keywordIndex];
    const bucket = { keyword, rawCount: 0, filteredCount: 0, stats: {}, items: [] };
    for (let page = 1; page <= safePagesPerKeyword; page += 1) {
      try {
        const pageItems = await searchVideos({
          keyword,
          page,
          limit: safePageSize,
          cookieHeader,
        });
        requestCount += 1;
        rawCandidates.push(...pageItems);
        bucket.rawCount += pageItems.length;
        bucket.items.push(...pageItems);
      } catch (error) {
        warnings.push({
          type: shouldStopOnRisk(error) ? "search-risk" : "search-error",
          keyword,
          page,
          code: Number(error?.code || 0),
          message: error instanceof Error ? error.message : String(error),
        });
        if (shouldStopOnRisk(error)) {
          stoppedByRisk = true;
        }
        break;
      }

      const uniqueCount = new Set(rawCandidates.map((item) => item.bvid)).size;
      const hasMoreWork =
        (page < safePagesPerKeyword && !stoppedByRisk) ||
        (keywordIndex < dedupedKeywords.length - 1 && !stoppedByRisk);

      if (uniqueCount >= safeTargetCount && page >= 1) {
        break;
      }

      if (page < safePagesPerKeyword && !stoppedByRisk) {
        await sleep(randomBetween(minIntervalSec, maxIntervalSec) * 1000);
      } else if (hasMoreWork && keywordIndex < dedupedKeywords.length - 1 && !stoppedByRisk) {
        await sleep(randomBetween(keywordPauseMinSec, keywordPauseMaxSec) * 1000);
      }
    }
    const enriched = enrichKeywordCohort(keyword, bucket.items, Number(maxAgeDays || 90));
    byKeyword.push(enriched);
    const mergedUnique = mergeKeywordResults(byKeyword, safeTargetCount);
    if (mergedUnique.length >= safeTargetCount) {
      break;
    }
  }

  const merged = mergeKeywordResults(byKeyword, safeTargetCount);
  const manualSeeds = await hydrateManualSeeds(manualBvids, cookieHeader);
  warnings.push(...manualSeeds.warnings);

  const manualItems = manualSeeds.items.map((item) => ({
    ...item,
    sourceKeywords: [],
    keywordScores: {},
    selectedKeyword: "manual-seed",
    mergedScore: Number(item.mergedScore || 110),
    manualSeed: true,
  }));

  const finalMerged = [
    ...manualItems,
    ...merged.filter((item) => !manualItems.find((seed) => seed.bvid === item.bvid)),
  ];

  return {
    fetchedAt,
    params: {
      keywords: dedupedKeywords,
      pagesPerKeyword: safePagesPerKeyword,
      pageSize: safePageSize,
      targetCount: safeTargetCount,
      maxAgeDays: Number(maxAgeDays || 90),
      minIntervalSec: Number(minIntervalSec || 5),
      maxIntervalSec: Number(maxIntervalSec || 10),
      keywordPauseMinSec: Number(keywordPauseMinSec || 8),
      keywordPauseMaxSec: Number(keywordPauseMaxSec || 15),
    },
    keywordCount: byKeyword.length,
    requestCount,
    rawCandidateCount: rawCandidates.length,
    filteredCandidateCount: byKeyword.reduce((total, bucket) => total + Number(bucket.filteredCount || bucket.items.length || 0), 0),
    warnings,
    byKeyword,
    merged: {
      items: finalMerged,
    },
  };
}

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const [command] = positionals;

  if (!command || options.help) {
    printUsage();
    return;
  }

  if (command === "search") {
    const result = await searchVideos({
      keyword: requireOption(options, "keyword", "search requires --keyword"),
      page: options.page,
      limit: options.limit,
      raw: Boolean(options.raw),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === "collect") {
    const keywords = dedupe([
      ...splitList(options.keywords || ""),
      ...splitList(options.keyword || ""),
    ]);
    const result = await collectVideoPool({
      keywords,
      pagesPerKeyword: options["pages-per-keyword"],
      pageSize: options["page-size"],
      targetCount: options["target-count"],
      maxAgeDays: options["max-age-days"],
      minIntervalSec: options["min-interval-sec"],
      maxIntervalSec: options["max-interval-sec"],
      keywordPauseMinSec: options["keyword-pause-min-sec"],
      keywordPauseMaxSec: options["keyword-pause-max-sec"],
      manualBvids: splitList(options["manual-bvids"] || ""),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
