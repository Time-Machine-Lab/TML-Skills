'use strict';

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

module.exports = {
  buildCommentThreadContext,
};
