'use strict';

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const output = [];
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

function countMatches(text, patterns) {
  const source = String(text || '');
  return patterns.reduce((count, pattern) => count + (pattern.test(source) ? 1 : 0), 0);
}

function scoreIntentSignals(comment) {
  const text = String(comment?.message || '').trim();
  const weakSignals = [
    /\b666\b/i,
    /球/,
    /求/,
    /蹲/,
    /滴滴/,
    /私/,
    /链接/,
    /入口/,
    /来个/,
  ];
  const strongSignals = [
    /接口/,
    /api/i,
    /怎么搞/,
    /怎么接/,
    /怎么弄/,
    /怎么收费/,
    /收费/,
    /价格/,
    /教程/,
    /能不能/,
    /有吗/,
    /求带/,
    /求教/,
    /长期/,
    /自用/,
    /稳定/,
    /并发/,
    /工作流/,
  ];

  const weakCount = countMatches(text, weakSignals);
  const strongCount = countMatches(text, strongSignals);
  let score = strongCount * 20 + weakCount * 8;

  if (Number(comment?.replies || 0) > 0) {
    score += Math.min(Number(comment.replies || 0), 5) * 4;
  }
  if (Number(comment?.like || 0) > 0) {
    score += Math.min(Number(comment.like || 0), 20);
  }
  if (text.length >= 8 && text.length <= 80) {
    score += 6;
  }

  const reasons = [];
  if (strongCount > 0) {
    reasons.push('命中强需求词');
  }
  if (weakCount > 0) {
    reasons.push('命中弱需求暗号');
  }
  if (Number(comment?.replies || 0) > 0) {
    reasons.push('已有子评论互动');
  }
  if (Number(comment?.like || 0) > 0) {
    reasons.push('已有点赞互动');
  }

  let level = 'low';
  if (score >= 35) {
    level = 'high';
  } else if (score >= 16) {
    level = 'medium';
  }

  return {
    score,
    level,
    reasons,
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
      hint: '可以扩大 `--root-search-pages`，然后重新执行 `thread draft --id "<BV>" --root <rpid>`。',
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
      rootLookup.item ? '先读 rootComment，再结合 replies 判断是否值得回复。' : '当前缺少 rootComment 本体，建议先扩大 root 搜索页数再生成草稿。',
      (replies.items || []).length ? '如果子评论里已经有连续对话，优先围绕最近一轮回复继续聊。' : '当前还没有明显子评论上下文，可以考虑直接回复 root 评论。',
      `下一步可直接用 \`thread draft --id "${detail.bvid}" --root ${root}\` 生成草稿，或用 \`thread send --channel comment --id "${detail.bvid}" --root ${root} --content "<text>" --yes\` 回复。`,
    ],
  };
}

async function buildVideoCommentDiscovery({
  client,
  id,
  page = 1,
  size = 20,
  searchPages = 2,
  sort = 1,
  nohot = 0,
  productSlug = '',
  limit = 20,
}) {
  const detail = await client.getVideoDetail(id);
  const scanned = [];
  let scanWarning = null;
  try {
    const main = await client.scanMainComments({
      id,
      mode: 3,
    });
    scanned.push(...(main.topReplies || []), ...(main.hots || []), ...(main.items || []));
  } catch (error) {
    scanWarning = {
      source: 'comment.discovery.scan-main',
      message: error.message,
      hint: error.hint || '',
    };
  }

  const listed = [];
  for (let currentPage = page; currentPage < page + Math.max(1, Math.min(Number(searchPages || 2), 5)); currentPage += 1) {
    const result = await client.listComments({
      id,
      page: currentPage,
      size,
      sort,
      nohot,
    });
    listed.push(...(result.items || []));
  }

  const merged = uniqueBy([...scanned, ...listed], (item) => String(item?.rpid || ''));
  const items = merged
    .map((comment) => {
      const signal = scoreIntentSignals(comment);
      return {
        ...comment,
        signal,
        commands: [
          `node scripts/bili.js thread draft --id "${detail.bvid}" --root ${comment.rpid}${productSlug ? ` --product "${productSlug}"` : ''} --channel comment`,
          `node scripts/bili.js thread send --channel comment --id "${detail.bvid}" --root ${comment.rpid}${productSlug ? ` --product "${productSlug}"` : ''} --content "<text>" --yes`,
        ],
      };
    })
    .sort((a, b) => {
      if (b.signal.score !== a.signal.score) {
        return b.signal.score - a.signal.score;
      }
      if (Number(b.replies || 0) !== Number(a.replies || 0)) {
        return Number(b.replies || 0) - Number(a.replies || 0);
      }
      return Number(b.like || 0) - Number(a.like || 0);
    })
    .slice(0, Math.max(1, Math.min(Number(limit || 20), 50)));

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
    scan: {
      page,
      size,
      searchPages,
      sort,
      nohot,
      scannedCount: scanned.length,
      listedCount: listed.length,
      mergedCount: merged.length,
    },
    heuristic: {
      highIntentExamples: ['接口', 'API', '怎么搞', '怎么接', '怎么收费', '价格', '教程', '自用', '长期', '工作流'],
      weakIntentExamples: ['666', '球', '求', '蹲', '滴滴', '私', '链接', '入口'],
      note: '这是评论区信号启发式，不是最终判断。最适合交给 agent 二次筛选。',
    },
    items,
    warnings: [scanWarning].filter(Boolean),
    nextSteps: [
      '优先看 signal.level 为 high 或 medium 的评论，再结合视频上下文决定是否回复。',
      '对候选评论先执行 `thread draft --id "<BV>" --root <rpid>`，不要直接批量发送。',
      '像“666”“球”“求”“蹲”这类暗号只代表可能有意向，不代表一定适合立刻强推。',
    ],
  };
}

module.exports = {
  buildCommentThreadContext,
  buildVideoCommentDiscovery,
};
