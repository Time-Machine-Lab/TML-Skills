'use strict';

const { CliError } = require('./errors');
const { getProduct } = require('./products');

function toTimestampSeconds(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function normalizeNumber(value) {
  if (value == null || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const text = String(value).trim().toLowerCase();
  if (!text) {
    return 0;
  }
  if (/^\d+(\.\d+)?万$/.test(text)) {
    return Math.round(parseFloat(text) * 10000);
  }
  if (/^\d+(\.\d+)?亿$/.test(text)) {
    return Math.round(parseFloat(text) * 100000000);
  }
  const digits = text.replace(/[^\d.]/g, '');
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tokenizeText(text) {
  return Array.from(
    new Set(
      String(text || '')
        .toLowerCase()
        .split(/[\s,，。；;、|/]+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
    )
  );
}

function buildKeywords({ keyword, product }) {
  const values = [keyword];
  if (product) {
    values.push(product.profile?.title || '');
    values.push(...(Array.isArray(product.profile?.audience) ? product.profile.audience : []));
    values.push(...(Array.isArray(product.profile?.sellingPoints) ? product.profile.sellingPoints : []));
    values.push(product.brief || '');
    values.push(product.faq || '');
  }
  return tokenizeText(values.join(' ')).slice(0, 30);
}

function textContainsAny(text, keywords) {
  const source = String(text || '').toLowerCase();
  return keywords.some((keyword) => source.includes(keyword));
}

function computeRelevanceScore(item, keywords) {
  if (!keywords.length) {
    return 0;
  }
  const title = String(item.title || '').toLowerCase();
  const description = String(item.description || '').toLowerCase();
  let score = 0;
  const hits = [];
  for (const keyword of keywords) {
    if (title.includes(keyword)) {
      score += 8;
      hits.push(`标题命中 ${keyword}`);
      continue;
    }
    if (description.includes(keyword)) {
      score += 4;
      hits.push(`简介命中 ${keyword}`);
    }
  }
  return {
    score: Math.min(score, 40),
    hits: hits.slice(0, 5),
  };
}

function computeRecencyScore(pubdate, daysWithin) {
  const ts = toTimestampSeconds(pubdate);
  if (!ts) {
    return { score: 0, reason: '缺少发布时间' };
  }
  const ageDays = (Date.now() - ts * 1000) / (24 * 60 * 60 * 1000);
  if (daysWithin && ageDays > daysWithin) {
    return { score: 0, reason: `超过 ${daysWithin} 天` };
  }
  if (ageDays <= 3) {
    return { score: 25, reason: '近 3 天发布' };
  }
  if (ageDays <= 7) {
    return { score: 20, reason: '近 7 天发布' };
  }
  if (ageDays <= 30) {
    return { score: 12, reason: '近 30 天发布' };
  }
  if (ageDays <= 90) {
    return { score: 6, reason: '近 90 天发布' };
  }
  return { score: 2, reason: '发布时间较久' };
}

function computeEngagementScore(play, favorites) {
  const safePlay = Math.max(normalizeNumber(play), 0);
  const safeFavorites = Math.max(normalizeNumber(favorites), 0);
  if (!safePlay) {
    return { score: 0, reason: '播放量过低' };
  }
  const favoriteRate = safeFavorites / Math.max(safePlay, 1);
  if (favoriteRate >= 0.08) {
    return { score: 20, reason: '收藏率很高' };
  }
  if (favoriteRate >= 0.04) {
    return { score: 14, reason: '收藏率不错' };
  }
  if (favoriteRate >= 0.02) {
    return { score: 8, reason: '收藏率一般' };
  }
  return { score: 3, reason: '收藏率偏低' };
}

function computeReachScore(play) {
  const safePlay = Math.max(normalizeNumber(play), 0);
  if (safePlay >= 1000000) {
    return { score: 15, reason: '超高播放量' };
  }
  if (safePlay >= 100000) {
    return { score: 12, reason: '高播放量' };
  }
  if (safePlay >= 20000) {
    return { score: 8, reason: '中高播放量' };
  }
  if (safePlay >= 5000) {
    return { score: 5, reason: '中等播放量' };
  }
  return { score: 1, reason: '播放量较低' };
}

function passesFilters(item, filters) {
  const play = normalizeNumber(item.play);
  const favorites = normalizeNumber(item.favorites);
  const pubdate = toTimestampSeconds(item.pubdate);
  const now = Date.now();

  if (filters.minPlay && play < filters.minPlay) {
    return false;
  }
  if (filters.maxPlay && play > filters.maxPlay) {
    return false;
  }
  if (filters.minFavorites && favorites < filters.minFavorites) {
    return false;
  }
  if (filters.daysWithin && pubdate) {
    const ageDays = (now - pubdate * 1000) / (24 * 60 * 60 * 1000);
    if (ageDays > filters.daysWithin) {
      return false;
    }
  }
  return true;
}

async function discoverPromotionVideos({
  client,
  keyword,
  productSlug = '',
  order = 'totalrank',
  duration = 0,
  tids = 0,
  page = 1,
  pageSize = 20,
  pages = 2,
  daysWithin = 30,
  minPlay = 0,
  maxPlay = 0,
  minFavorites = 0,
  minComments = 0,
}) {
  const product = productSlug ? getProduct(productSlug) : null;
  if (productSlug && !product) {
    throw new CliError(
      `未找到产品资料：${productSlug}`,
      1,
      { productSlug },
      '先执行 `node scripts/bili.js product list` 查看可用产品。'
    );
  }

  const keywords = buildKeywords({ keyword, product });
  const collected = [];
  const totalPages = Math.max(1, Math.min(Number(pages || 1), 5));
  const effectivePageSize = Math.max(5, Math.min(Number(pageSize || 20), 50));

  for (let index = 0; index < totalPages; index += 1) {
    let result;
    try {
      result = await client.searchVideos({
        keyword,
        order,
        duration,
        tids,
        page: Number(page || 1) + index,
        pageSize: effectivePageSize,
      });
    } catch (error) {
      const code = Number(error?.details?.code || 0);
      if (code === 412 || /412/.test(String(error.message || ''))) {
        throw new CliError(
          '当前候选视频搜索触发了 B 站风控。',
          1,
          {
            keyword,
            order,
            page: Number(page || 1) + index,
          },
          '先确认登录态完整，再降低搜索频率；必要时切回 `search hot`、换更窄的关键词，或稍后重试。'
        );
      }
      throw error;
    }
    collected.push(...(result.items || []));
  }

  const deduped = Array.from(new Map(collected.map((item) => [item.bvid || item.aid, item])).values());
  const effectiveMinPlay = Number(minPlay || (productSlug ? 20000 : 0));
  const effectiveMinFavorites = Number(minFavorites || (productSlug ? 200 : 0));
  const filters = {
    daysWithin: Number(daysWithin || 0),
    minPlay: effectiveMinPlay,
    maxPlay: Number(maxPlay || 0),
    minFavorites: effectiveMinFavorites,
  };

  const scored = deduped
    .filter((item) => passesFilters(item, filters))
    .map((item) => {
      const relevance = computeRelevanceScore(item, keywords);
      const recency = computeRecencyScore(item.pubdate, filters.daysWithin);
      const engagement = computeEngagementScore(item.play, item.favorites);
      const reach = computeReachScore(item.play);
      const promotionScore = relevance.score + recency.score + engagement.score + reach.score;
      const whySelected = [
        ...relevance.hits,
        recency.reason,
        engagement.reason,
        reach.reason,
      ].filter(Boolean);
      return {
        ...item,
        metrics: {
          play: normalizeNumber(item.play),
          favorites: normalizeNumber(item.favorites),
          favoriteRate: normalizeNumber(item.play) ? Number((normalizeNumber(item.favorites) / Math.max(normalizeNumber(item.play), 1)).toFixed(4)) : 0,
          ageDays: item.pubdate ? Number((((Date.now() - toTimestampSeconds(item.pubdate) * 1000) / (24 * 60 * 60 * 1000))).toFixed(1)) : null,
        },
        scoring: {
          promotionScore,
          relevanceScore: relevance.score,
          recencyScore: recency.score,
          engagementScore: engagement.score,
          reachScore: reach.score,
        },
        whySelected,
        nextAction:
          promotionScore >= 60
            ? '优先读取评论区并判断是否值得长时间停留。'
            : promotionScore >= 40
              ? '可作为第二批候选，先观察评论活跃度和高意向评论密度。'
              : '相关性或互动潜力一般，除非当前没有更好的视频，否则放在后面处理。',
      };
    })
    .sort((a, b) => b.scoring.promotionScore - a.scoring.promotionScore);

  const enriched = [];
  for (const item of scored) {
    let commentCount = 0;
    try {
      const commentSnapshot = await client.listComments({
        id: item.bvid || item.aid,
        page: 1,
        size: 1,
        sort: 1,
      });
      commentCount = Number(commentSnapshot?.page?.count || 0);
    } catch {
      commentCount = 0;
    }
    if (Number(minComments || 0) && commentCount < Number(minComments || 0)) {
      continue;
    }
    enriched.push({
      ...item,
      metrics: {
        ...(item.metrics || {}),
        commentCount,
      },
      whySelected: [
        ...(item.whySelected || []),
        commentCount >= Number(minComments || 0) && Number(minComments || 0)
          ? `评论数 ${commentCount}，满足最小评论数要求`
          : `评论数 ${commentCount}`,
      ].filter(Boolean),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    query: {
      keyword,
      productSlug,
      order,
      duration,
      tids,
      page,
      pageSize: effectivePageSize,
      pages: totalPages,
      filters,
      minComments: Number(minComments || 0),
      strategy: {
        avoidLowTrafficVideos: Boolean(productSlug),
        note: productSlug
          ? '绑定产品资料时会默认跳过低播放、低收藏的视频，优先更有互动密度的评论区。'
          : '未绑定产品资料时，只按显式 filters 过滤。',
      },
    },
    keywords,
    product: product
      ? {
          slug: product.slug,
          title: product.profile?.title || product.slug,
          path: product.path,
        }
      : null,
    items: enriched,
    nextSteps: [
      enriched.length ? '优先处理 promotionScore 最高、播放不低、评论数达标、且更适合长时间停留的视频。' : '当前过滤条件较严，可以放宽 days-within、min-play、min-comments 或换一个关键词。',
      '不要连续翻很多页搜索；优先先把当前最好的 1-2 个候选视频吃深，再决定是否继续搜索。',
    ],
  };
}

function computeCommentIntentScore(item, keywords) {
  const message = String(item.message || '').toLowerCase();
  let score = 0;
  const reasons = [];

  if (keywords.length) {
    const hits = keywords.filter((keyword) => message.includes(keyword)).slice(0, 5);
    if (hits.length) {
      score += Math.min(hits.length * 8, 32);
      reasons.push(...hits.map((keyword) => `评论命中 ${keyword}`));
    }
  }

  if (/[?？]/.test(message)) {
    score += 10;
    reasons.push('包含提问语气');
  }
  if (/(怎么|如何|有没有|能不能|适合|推荐|求|请问|教程|资料|群|联系|商务|合作|价格|多少钱)/.test(message)) {
    score += 14;
    reasons.push('包含明显咨询或转化信号');
  }
  if (message.length >= 12) {
    score += 4;
    reasons.push('评论长度较充分');
  }

  return {
    score: Math.min(score, 50),
    reasons: reasons.slice(0, 6),
  };
}

function computeCommentEngagementScore(item) {
  const like = Number(item.like || 0);
  const replies = Number(item.replies || 0);
  let score = 0;
  const reasons = [];

  if (like >= 50) {
    score += 15;
    reasons.push('评论点赞很高');
  } else if (like >= 10) {
    score += 10;
    reasons.push('评论点赞不错');
  } else if (like >= 3) {
    score += 5;
    reasons.push('评论有一定点赞');
  }

  if (replies >= 10) {
    score += 12;
    reasons.push('评论下已有多轮讨论');
  } else if (replies >= 3) {
    score += 7;
    reasons.push('评论下有回复互动');
  }

  return {
    score: Math.min(score, 25),
    reasons,
  };
}

function computeCommentFreshnessScore(item, daysWithin) {
  const ts = toTimestampSeconds(item.ctime);
  if (!ts) {
    return { score: 0, reason: '缺少评论时间' };
  }
  const ageDays = (Date.now() - ts * 1000) / (24 * 60 * 60 * 1000);
  if (daysWithin && ageDays > daysWithin) {
    return { score: 0, reason: `评论超过 ${daysWithin} 天` };
  }
  if (ageDays <= 1) {
    return { score: 15, reason: '近 1 天评论' };
  }
  if (ageDays <= 7) {
    return { score: 10, reason: '近 7 天评论' };
  }
  if (ageDays <= 30) {
    return { score: 5, reason: '近 30 天评论' };
  }
  return { score: 2, reason: '评论时间较久' };
}

function commentPassesFilters(item, filters, keywords) {
  const like = Number(item.like || 0);
  const replies = Number(item.replies || 0);
  const message = String(item.message || '');
  if (filters.minLike && like < filters.minLike) {
    return false;
  }
  if (filters.minReplies && replies < filters.minReplies) {
    return false;
  }
  if (filters.minLength && message.length < filters.minLength) {
    return false;
  }
  if (filters.requireKeyword && keywords.length && !textContainsAny(message, keywords)) {
    return false;
  }
  return true;
}

async function fetchVideoComments({ client, id, pages = 1, size = 20, mode = 3 }) {
  try {
    const combined = [];
    let nextOffset = '';
    const loops = Math.max(1, Math.min(Number(pages || 1), 3));
    for (let index = 0; index < loops; index += 1) {
      const result = await client.scanMainComments({
        id,
        mode,
        nextOffset,
      });
      combined.push(...(result.topReplies || []), ...(result.hots || []), ...(result.items || []));
      nextOffset = result.cursor?.nextOffset || '';
      if (!nextOffset || result.cursor?.isEnd) {
        break;
      }
    }
    return {
      source: 'scan-main',
      items: Array.from(new Map(combined.map((item) => [item.rpid, item])).values()).slice(0, size * loops),
    };
  } catch (error) {
    const result = await client.listComments({
      id,
      page: 1,
      size: Math.max(size, 20),
      sort: 1,
      nohot: 0,
    });
    return {
      source: 'list',
      items: result.items || [],
      warning: {
        source: 'comment.scan-main',
        message: error.message,
        hint: error.hint || '',
      },
    };
  }
}

async function discoverPromotionComments({
  client,
  id,
  productSlug = '',
  keyword = '',
  pages = 1,
  size = 20,
  daysWithin = 30,
  minLike = 0,
  minReplies = 0,
  minLength = 6,
  requireKeyword = false,
}) {
  const product = productSlug ? getProduct(productSlug) : null;
  if (productSlug && !product) {
    throw new CliError(
      `未找到产品资料：${productSlug}`,
      1,
      { productSlug },
      '先执行 `node scripts/bili.js product list` 查看可用产品。'
    );
  }
  const detail = await client.getVideoDetail(id);
  const keywords = buildKeywords({ keyword, product });
  const fetched = await fetchVideoComments({ client, id, pages, size });
  const filters = {
    daysWithin: Number(daysWithin || 0),
    minLike: Number(minLike || 0),
    minReplies: Number(minReplies || 0),
    minLength: Number(minLength || 0),
    requireKeyword: Boolean(requireKeyword),
  };

  const items = (fetched.items || [])
    .filter((item) => commentPassesFilters(item, filters, keywords))
    .map((item) => {
      const intent = computeCommentIntentScore(item, keywords);
      const engagement = computeCommentEngagementScore(item);
      const freshness = computeCommentFreshnessScore(item, filters.daysWithin);
      const leadScore = intent.score + engagement.score + freshness.score;
      return {
        ...item,
        scoring: {
          leadScore,
          intentScore: intent.score,
          engagementScore: engagement.score,
          freshnessScore: freshness.score,
        },
        whySelected: [...intent.reasons, ...engagement.reasons, freshness.reason].filter(Boolean),
        nextAction:
          leadScore >= 45
            ? '优先生成回复草稿或拉入 thread 继续跟进。'
            : leadScore >= 25
              ? '可作为备选线索，先结合上下文判断。'
              : '线索较弱，放在后面处理。',
      };
    })
    .sort((a, b) => b.scoring.leadScore - a.scoring.leadScore);

  return {
    generatedAt: new Date().toISOString(),
    video: {
      bvid: detail.bvid,
      aid: detail.aid,
      title: detail.title,
      owner: detail.owner,
      stat: detail.stat,
      pubdate: detail.pubdate,
    },
    source: fetched.source,
    warning: fetched.warning || null,
    query: {
      id,
      productSlug,
      keyword,
      pages,
      size,
      filters,
    },
    keywords,
    items,
    nextSteps: [
      items.length ? '优先对 leadScore 最高的评论执行 `thread draft` 或 `comment send` 回复。' : '当前没有筛出明显线索，可以放宽过滤条件，或者换一个视频再试。',
      '如果评论者后续继续回复，再通过 `notify replies` 和 `thread continue` 接着聊。',
    ],
  };
}

async function fetchRootComment({ client, id, root, searchPages = 3 }) {
  try {
    const scanned = await client.scanMainComments({
      id,
      mode: 3,
      seekRpid: root,
    });
    const found = [...(scanned.topReplies || []), ...(scanned.hots || []), ...(scanned.items || [])].find(
      (item) => String(item.rpid) === String(root)
    );
    if (found) {
      return {
        item: found,
        source: 'scan-main',
        warning: null,
      };
    }
  } catch (error) {
    return {
      item: null,
      source: 'scan-main',
      warning: {
        source: 'comment.scan-main.root',
        message: error.message,
        hint: error.hint || '',
      },
    };
  }

  for (let page = 1; page <= Math.max(1, Math.min(Number(searchPages || 3), 5)); page += 1) {
    const listed = await client.listComments({
      id,
      page,
      size: 20,
      sort: 1,
      nohot: 0,
    });
    const found = (listed.items || []).find((item) => String(item.rpid) === String(root));
    if (found) {
      return {
        item: found,
        source: `list.page.${page}`,
        warning: null,
      };
    }
  }

  return {
    item: null,
    source: 'list',
    warning: {
      source: 'comment.root.lookup',
      message: '未在已扫描的主评论页里找到 root 评论。',
      hint: '可以扩大 root 搜索页数，或者先用 comment list / scan-main 手动确认这条评论位置。',
    },
  };
}

async function buildCommentThreadContext({
  client,
  id,
  root,
  page = 1,
  size = 20,
  hotPage = 1,
  hotSize = 10,
  rootSearchPages = 3,
}) {
  const detail = await client.getVideoDetail(id);
  const rootLookup = await fetchRootComment({
    client,
    id,
    root,
    searchPages: rootSearchPages,
  });
  const replies = await client.listReplies({
    id,
    root,
    page,
    size,
  });
  let hotReplies = null;
  let hotWarning = null;
  try {
    hotReplies = await client.listHotReplies({
      id,
      root,
      page: hotPage,
      size: hotSize,
    });
  } catch (error) {
    hotWarning = {
      source: 'comment.hot',
      message: error.message,
      hint: error.hint || '',
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    video: {
      bvid: detail.bvid,
      aid: detail.aid,
      title: detail.title,
      owner: detail.owner,
      stat: detail.stat,
      pubdate: detail.pubdate,
    },
    thread: {
      root,
      rootComment: rootLookup.item,
      rootSource: rootLookup.source,
      repliesPage: page,
      repliesSize: size,
      replies: replies.items || [],
      repliesPageInfo: replies.page || null,
      hotReplies: hotReplies?.items || [],
      hotRepliesPageInfo: hotReplies?.page || null,
    },
    warnings: [rootLookup.warning, hotWarning].filter(Boolean),
    nextSteps: [
      rootLookup.item ? '先让 agent 读 rootComment，再结合 replies 判断是否值得回复。' : '当前缺少 rootComment 本体，建议先手动确认该楼层，再决定是否继续。',
      (replies.items || []).length ? '如果子评论里已经有连续对话，优先围绕最近一轮回复继续聊。' : '当前还没有明显子评论上下文，可以考虑直接回复 root 评论。',
      `下一步可直接用 \`thread draft --id "${detail.bvid}" --root ${root}\` 生成草稿，或用 \`thread send --channel comment --id "${detail.bvid}" --root ${root} --content "<text>" --yes\` 回复。`
    ],
  };
}

async function findPromotionLeads({
  client,
  keyword,
  productSlug = '',
  order = 'pubdate',
  daysWithin = 30,
  minPlay = 5000,
  minFavorites = 0,
  candidateVideos = 3,
  commentPages = 1,
  commentSize = 20,
}) {
  const videoDiscovery = await discoverPromotionVideos({
    client,
    keyword,
    productSlug,
    order,
    daysWithin,
    minPlay,
    minFavorites,
    pageSize: Math.max(candidateVideos * 3, 10),
    pages: 1,
  });

  const selectedVideos = (videoDiscovery.items || []).slice(0, Math.max(1, Math.min(candidateVideos, 5)));
  const leadBatches = [];
  for (const video of selectedVideos) {
    try {
      const comments = await discoverPromotionComments({
        client,
        id: video.bvid || String(video.aid),
        productSlug,
        keyword,
        pages: commentPages,
        size: commentSize,
      });
      leadBatches.push({
        video: {
          bvid: video.bvid,
          aid: video.aid,
          title: video.title,
          promotionScore: video.scoring?.promotionScore || 0,
        },
        leads: comments.items.slice(0, 10),
        warning: comments.warning || null,
      });
    } catch (error) {
      leadBatches.push({
        video: {
          bvid: video.bvid,
          aid: video.aid,
          title: video.title,
          promotionScore: video.scoring?.promotionScore || 0,
        },
        leads: [],
        warning: {
          message: error.message,
          hint: error.hint || '',
        },
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    query: {
      keyword,
      productSlug,
      order,
      daysWithin,
      minPlay,
      minFavorites,
      candidateVideos,
      commentPages,
      commentSize,
    },
    videos: selectedVideos,
    leadBatches,
    nextSteps: [
      leadBatches.length ? '优先从高 promotionScore 视频里挑 leadScore 最高的评论继续跟进。' : '先放宽视频筛选条件，或者换一个更具体的关键词。',
      '对具体评论对象，下一步走 `thread draft` 或评论区 `comment send`。'
    ],
  };
}

module.exports = {
  discoverPromotionVideos,
  discoverPromotionComments,
  findPromotionLeads,
  buildCommentThreadContext,
};
