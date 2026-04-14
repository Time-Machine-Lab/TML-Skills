'use strict';

function extractVideoId(input) {
  if (!input) {
    return null;
  }

  const value = String(input).trim();
  const bvMatch = value.match(/BV[0-9A-Za-z]+/i);
  if (bvMatch) {
    const matched = bvMatch[0];
    return `BV${matched.slice(2)}`;
  }

  const avMatch = value.match(/(?:^|\/|[?&])av(\d+)/i);
  if (avMatch) {
    return avMatch[1];
  }

  if (/^\d+$/.test(value)) {
    return value;
  }

  return value;
}

function normalizeVideoDetail(data) {
  const core = data.data || data;
  return {
    bvid: core.bvid,
    aid: core.aid,
    cid: core.cid,
    title: core.title,
    desc: core.desc,
    owner: core.owner
      ? {
          mid: core.owner.mid,
          name: core.owner.name,
        }
      : null,
    stat: core.stat || null,
    duration: core.duration,
    pubdate: core.pubdate,
    redirectUrl: core.redirect_url || null,
    pages: Array.isArray(core.pages)
      ? core.pages.map((page) => ({
          cid: page.cid,
          page: page.page,
          part: page.part,
          duration: page.duration,
        }))
      : [],
    raw: data,
  };
}

function normalizeSearchResult(data) {
  const result = data.result || [];
  return {
    page: data.page || 1,
    pageSize: data.numPages ? result.length : result.length,
    numPages: data.numPages || null,
    numResults: data.numResults || null,
    items: result.map((item) => ({
      bvid: item.bvid,
      aid: item.aid,
      title: stripTags(item.title),
      author: item.author,
      mid: item.mid,
      description: stripTags(item.description || ''),
      play: item.play,
      favorites: item.favorites,
      duration: item.duration,
      pubdate: item.pubdate,
      arcurl: item.arcurl,
    })),
    raw: data,
  };
}

function normalizeHotSearch(data) {
  const list = Array.isArray(data.list) ? data.list : [];
  return {
    items: list.map((item) => ({
      keyword: item.keyword,
      showName: item.show_name,
      icon: item.icon,
      rank: item.pos,
      score: item.score,
    })),
    raw: data,
  };
}

function normalizeComments(data) {
  const page = data.page || {};
  const replies = Array.isArray(data.replies) ? data.replies : [];
  return {
    page: {
      num: page.num,
      size: page.size,
      count: page.count,
    },
    items: replies.map((reply) => ({
      rpid: String(reply.rpid),
      root: reply.root ? String(reply.root) : null,
      parent: reply.parent ? String(reply.parent) : null,
      oid: reply.oid ? String(reply.oid) : null,
      username: reply.member?.uname || null,
      mid: reply.member?.mid || null,
      level: reply.member?.level_info?.current_level || null,
      message: reply.content?.message || '',
      like: reply.like || 0,
      replies: reply.rcount || 0,
      ctime: reply.ctime || null,
      date: reply.ctime ? new Date(reply.ctime * 1000).toISOString() : null,
    })),
    raw: data,
  };
}

function normalizeCommentItem(reply) {
  if (!reply) {
    return null;
  }
  return {
    rpid: String(reply.rpid ?? ''),
    root: reply.root ? String(reply.root) : null,
    parent: reply.parent ? String(reply.parent) : null,
    dialog: reply.dialog ? String(reply.dialog) : null,
    oid: reply.oid ? String(reply.oid) : null,
    username: reply.member?.uname || null,
    mid: reply.member?.mid || null,
    level: reply.member?.level_info?.current_level || null,
    sign: reply.member?.sign || '',
    message: reply.content?.message || '',
    like: reply.like || 0,
    replies: reply.rcount || 0,
    floor: reply.floor || null,
    ctime: reply.ctime || null,
    date: reply.ctime ? new Date(reply.ctime * 1000).toISOString() : null,
    isUpLiked: Boolean(reply.up_action?.like),
    isUpReplied: Boolean(reply.up_action?.reply),
    invisible: Boolean(reply.invisible),
    replyControl: reply.reply_control || null,
    raw: reply,
  };
}

function normalizeMainComments(data) {
  const cursor = data.cursor || {};
  const paginationReply = cursor.pagination_reply || {};
  const topReplies = Array.isArray(data.top_replies) ? data.top_replies : [];
  const hots = Array.isArray(data.hots) ? data.hots : [];
  const replies = Array.isArray(data.replies) ? data.replies : [];

  return {
    cursor: {
      isEnd: Boolean(cursor.is_end),
      mode: cursor.mode ?? null,
      next: cursor.next ?? null,
      nextOffset: paginationReply.next_offset || '',
      paginationReply,
      allCount: cursor.all_count ?? null,
    },
    topReplies: topReplies.map(normalizeCommentItem).filter(Boolean),
    hots: hots.map(normalizeCommentItem).filter(Boolean),
    items: replies.map(normalizeCommentItem).filter(Boolean),
    upper: data.upper || null,
    control: data.control || null,
    notice: data.notice || null,
    folder: data.folder || null,
    raw: data,
  };
}

function normalizeUserInfo(data) {
  return {
    mid: data.mid,
    uname: data.uname,
    money: data.money,
    levelInfo: data.level_info || null,
    vipStatus: data.vip_status,
    vipType: data.vipType,
    emailVerified: data.email_verified,
    mobileVerified: data.mobile_verified,
    raw: data,
  };
}

function normalizeAiSummary(data) {
  return {
    modelResult: data.model_result || null,
    summary: data.summary || null,
    outline: data.outline || [],
    raw: data,
  };
}

function normalizeReplyNotifications(data) {
  const cursor = data.cursor || {};
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    cursor: {
      isEnd: Boolean(cursor.is_end),
      id: cursor.id ?? null,
      time: cursor.time ?? null,
    },
    lastViewAt: data.last_view_at ?? null,
    items: items.map((entry) => ({
      id: entry.id,
      counts: entry.counts,
      isMulti: entry.is_multi,
      replyTime: entry.reply_time,
      user: entry.user
        ? {
            mid: entry.user.mid,
            nickname: entry.user.nickname,
            avatar: entry.user.avatar,
            follow: entry.user.follow,
          }
        : null,
      item: entry.item
        ? {
            subjectId: entry.item.subject_id,
            rootId: entry.item.root_id,
            sourceId: entry.item.source_id,
            targetId: entry.item.target_id,
            type: entry.item.type,
            businessId: entry.item.business_id,
            business: entry.item.business,
            title: entry.item.title,
            uri: entry.item.uri,
            nativeUri: entry.item.native_uri,
            rootReplyContent: entry.item.root_reply_content,
            sourceContent: entry.item.source_content,
            targetReplyContent: entry.item.target_reply_content,
            hideReplyButton: entry.item.hide_reply_button,
            hideLikeButton: entry.item.hide_like_button,
            likeState: entry.item.like_state,
            message: entry.item.message,
          }
        : null,
      raw: entry,
    })),
    raw: data,
  };
}

function normalizeUnreadNotifications(data) {
  return {
    at: data.at ?? 0,
    reply: data.reply ?? 0,
    recvLike: data.recv_like ?? data.like ?? 0,
    recvReply: data.recv_reply ?? 0,
    system: data.sys_msg ?? 0,
    up: data.up ?? 0,
    favorite: data.favorite ?? 0,
    coin: data.coin ?? 0,
    danmu: data.danmu ?? 0,
    raw: data,
  };
}

function normalizeDmSession(entry) {
  return {
    talkerId: String(entry.talker_id),
    sessionType: entry.session_type,
    isFollow: entry.is_follow,
    isDnd: entry.is_dnd,
    unreadCount: entry.unread_count,
    ackSeqno: entry.ack_seqno,
    ackTs: entry.ack_ts,
    sessionTs: entry.session_ts,
    maxSeqno: entry.max_seqno,
    topTs: entry.top_ts,
    groupName: entry.group_name,
    canFold: entry.can_fold,
    status: entry.status,
    lastMsg: entry.last_msg || null,
    raw: entry,
  };
}

function normalizeDmSessions(data) {
  const sessions = Array.isArray(data.session_list) ? data.session_list : [];
  return {
    hasMore: Boolean(data.has_more),
    antiDistrubCleaning: Boolean(data.anti_distrub_cleaning),
    showLevel: Boolean(data.show_level),
    systemMsg: data.system_msg || null,
    items: sessions.map(normalizeDmSession),
    raw: data,
  };
}

function normalizeDmMessage(entry) {
  let content = entry.content;
  try {
    content = typeof entry.content === 'string' ? JSON.parse(entry.content) : entry.content;
  } catch {
    content = entry.content;
  }
  return {
    senderUid: entry.sender_uid,
    receiverId: entry.receiver_id,
    receiverType: entry.receiver_type,
    msgKey: entry.msg_key,
    msgSeqno: entry.msg_seqno,
    msgType: entry.msg_type,
    msgStatus: entry.msg_status,
    timestamp: entry.timestamp,
    content,
    raw: entry,
  };
}

function normalizeDmMessages(data) {
  const messages = Array.isArray(data.messages) ? data.messages : [];
  return {
    hasMore: Boolean(data.has_more),
    minSeqno: data.min_seqno ?? null,
    maxSeqno: data.max_seqno ?? null,
    eInfos: data.e_infos || [],
    items: messages.map(normalizeDmMessage),
    raw: data,
  };
}

function stripTags(input) {
  return String(input || '').replace(/<[^>]+>/g, '');
}

module.exports = {
  extractVideoId,
  normalizeVideoDetail,
  normalizeSearchResult,
  normalizeHotSearch,
  normalizeComments,
  normalizeCommentItem,
  normalizeMainComments,
  normalizeUserInfo,
  normalizeAiSummary,
  normalizeReplyNotifications,
  normalizeUnreadNotifications,
  normalizeDmSessions,
  normalizeDmMessages,
};
