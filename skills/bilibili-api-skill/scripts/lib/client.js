'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { imageSize } = require('image-size');
const { readCredentials } = require('./config');
const { request, unwrapBiliResponse } = require('./http');
const { requireCookie, requireCsrf } = require('./cookie');
const { signWbiParams } = require('./wbi');
const { MAX_SEARCH_PAGE_SIZE, DEFAULT_RE_SRC } = require('./constants');
const {
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
} = require('./parsers');
const { readSession, patchSession } = require('./store');

class BilibiliClient {
  constructor(options = {}) {
    const credentials = readCredentials();
    this.cookie = options.cookie || credentials.cookie || '';
    this.userAgent = options.userAgent || credentials.userAgent;
  }

  headers(extra = {}) {
    return {
      'user-agent': this.userAgent,
      cookie: this.cookie || '',
      ...extra,
    };
  }

  async get(url, options = {}) {
    return request(url, {
      method: 'GET',
      headers: this.headers(options.headers),
      query: options.query,
      decompressDeflate: options.decompressDeflate,
    });
  }

  async post(url, options = {}) {
    return request(url, {
      method: 'POST',
      headers: this.headers(options.headers),
      query: options.query,
      form: options.form,
      json: options.json,
    });
  }

  async postMultipart(url, { form, query, headers = {} } = {}) {
    const target = new URL(url);
    if (query && typeof query === 'object') {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          target.searchParams.set(key, String(value));
        }
      }
    }
    const response = await fetch(target, {
      method: 'POST',
      headers: this.headers(headers),
      body: form,
    });
    const rawBody = await response.text();
    let parsedBody = rawBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {}
    if (!response.ok) {
      const { CliError } = require('./errors');
      throw new CliError(`HTTP ${response.status} ${response.statusText}`, response.status, {
        url: target.toString(),
        body: parsedBody,
      });
    }
    return {
      status: response.status,
      headers: response.headers,
      body: parsedBody,
      rawBody,
      url: target.toString(),
    };
  }

  resolveVideoId(input) {
    return extractVideoId(input);
  }

  async getUserInfo() {
    requireCookie(this.cookie);
    const data = unwrapBiliResponse(await this.get('https://api.bilibili.com/x/web-interface/nav'));
    return normalizeUserInfo(data);
  }

  async getVideoDetail(idOrUrl) {
    const id = this.resolveVideoId(idOrUrl);
    const query = id.startsWith('BV') ? { bvid: id } : { aid: id };
    const data = unwrapBiliResponse(await this.get('https://api.bilibili.com/x/web-interface/view', { query }));
    return normalizeVideoDetail(data);
  }

  async getVideoSummary(idOrUrl) {
    const detail = await this.getVideoDetail(idOrUrl);
    const query = await signWbiParams(
      {
        bvid: detail.bvid,
        cid: detail.pages[0]?.cid || detail.cid,
        up_mid: detail.owner?.mid || 0,
        web_location: '333.788',
      },
      this
    );
    const data = unwrapBiliResponse(
      await this.get('https://api.bilibili.com/x/web-interface/view/conclusion/get', { query })
    );
    return {
      video: detail,
      summary: normalizeAiSummary(data),
    };
  }

  async likeVideo(idOrUrl, like = 1) {
    requireCookie(this.cookie);
    const csrf = requireCsrf(this.cookie);
    const id = this.resolveVideoId(idOrUrl);
    const form = {
      like,
      csrf,
    };
    if (id.startsWith('BV')) {
      form.bvid = id;
    } else {
      form.aid = id;
    }
    unwrapBiliResponse(await this.post('https://api.bilibili.com/x/web-interface/archive/like', { form }));
    return { success: true, id, like };
  }

  async coinVideo(idOrUrl, count = 1, alsoLike = false) {
    requireCookie(this.cookie);
    const csrf = requireCsrf(this.cookie);
    const id = this.resolveVideoId(idOrUrl);
    const form = {
      multiply: Math.min(Math.max(count, 1), 2),
      select_like: alsoLike ? 1 : 0,
      csrf,
    };
    if (id.startsWith('BV')) {
      form.bvid = id;
    } else {
      form.aid = id;
    }
    unwrapBiliResponse(await this.post('https://api.bilibili.com/x/web-interface/coin/add', { form }));
    return { success: true, id, count: form.multiply, alsoLike };
  }

  async tripleVideo(idOrUrl) {
    requireCookie(this.cookie);
    const csrf = requireCsrf(this.cookie);
    const id = this.resolveVideoId(idOrUrl);
    const form = { csrf };
    if (id.startsWith('BV')) {
      form.bvid = id;
    } else {
      form.aid = id;
    }
    unwrapBiliResponse(await this.post('https://api.bilibili.com/x/web-interface/archive/like/triple', { form }));
    return { success: true, id };
  }

  async searchVideos({ keyword, order = 'totalrank', duration = 0, tids = 0, page = 1, pageSize = 10 }) {
    const query = await signWbiParams(
      {
        search_type: 'video',
        keyword,
        order,
        duration,
        tids,
        page,
        page_size: Math.min(pageSize, MAX_SEARCH_PAGE_SIZE),
      },
      this
    );
    const data = unwrapBiliResponse(await this.get('https://api.bilibili.com/x/web-interface/search/type', { query }));
    return normalizeSearchResult(data);
  }

  async getHotSearch() {
    const result = await this.get('https://s.search.bilibili.com/main/hotword');
    return normalizeHotSearch(result.body);
  }

  async resolveOid({ oid, id }) {
    if (oid) {
      return String(oid);
    }
    const detail = await this.getVideoDetail(id);
    return String(detail.aid);
  }

  async listComments({ oid, id, page = 1, size = 20, sort = 1, nohot = 1 }) {
    const realOid = await this.resolveOid({ oid, id });
    const data = unwrapBiliResponse(
      await this.get('https://api.bilibili.com/x/v2/reply', {
        query: { type: 1, oid: realOid, pn: page, ps: size, sort, nohot },
      })
    );
    return {
      oid: realOid,
      ...normalizeComments(data),
    };
  }

  async listReplies({ oid, id, root, page = 1, size = 20 }) {
    const realOid = await this.resolveOid({ oid, id });
    const data = unwrapBiliResponse(
      await this.get('https://api.bilibili.com/x/v2/reply/reply', {
        query: { type: 1, oid: realOid, root, pn: page, ps: size },
      })
    );
    return {
      oid: realOid,
      root: String(root),
      ...normalizeComments(data),
    };
  }

  async scanMainComments({ oid, id, mode = 3, nextOffset = '', seekRpid = '' }) {
    const realOid = await this.resolveOid({ oid, id });
    const query = await signWbiParams(
      {
        type: 1,
        oid: realOid,
        mode,
        pagination_str: JSON.stringify({ offset: nextOffset || '' }),
        plat: 1,
        seek_rpid: seekRpid || '',
        web_location: 1315875,
      },
      this
    );
    const data = unwrapBiliResponse(await this.get('https://api.bilibili.com/x/v2/reply/wbi/main', { query }));
    return {
      oid: realOid,
      mode,
      ...normalizeMainComments(data),
    };
  }

  async listHotReplies({ oid, id, root, page = 1, size = 20 }) {
    const realOid = await this.resolveOid({ oid, id });
    const data = unwrapBiliResponse(
      await this.get('https://api.bilibili.com/x/v2/reply/hot', {
        query: { type: 1, oid: realOid, root, pn: page, ps: size },
      })
    );
    return {
      oid: realOid,
      root: String(root),
      page: data.page || null,
      items: Array.isArray(data.replies) ? data.replies.map(normalizeCommentItem).filter(Boolean) : [],
      raw: data,
    };
  }

  async sendComment({ oid, id, message, root, parent }) {
    requireCookie(this.cookie);
    const csrf = requireCsrf(this.cookie);
    const realOid = await this.resolveOid({ oid, id });
    unwrapBiliResponse(
      await this.post('https://api.bilibili.com/x/v2/reply/add', {
        form: {
          type: 1,
          oid: realOid,
          message,
          plat: 1,
          root,
          parent,
          csrf,
        },
      })
    );
    return {
      success: true,
      oid: realOid,
      message,
      root: root ? String(root) : null,
      parent: parent ? String(parent) : null,
    };
  }

  async likeComment({ oid, id, rpid, action = 'like' }) {
    requireCookie(this.cookie);
    const csrf = requireCsrf(this.cookie);
    const realOid = await this.resolveOid({ oid, id });
    const url =
      action === 'dislike'
        ? 'https://api.bilibili.com/x/v2/reply/hate'
        : 'https://api.bilibili.com/x/v2/reply/action';
    unwrapBiliResponse(
      await this.post(url, {
        form: {
          type: 1,
          oid: realOid,
          rpid,
          action: 1,
          csrf,
        },
      })
    );
    return {
      success: true,
      oid: realOid,
      rpid: String(rpid),
      action,
    };
  }

  async followUser(mid, reSrc = DEFAULT_RE_SRC) {
    requireCookie(this.cookie);
    const csrf = requireCsrf(this.cookie);
    unwrapBiliResponse(
      await this.post('https://api.bilibili.com/x/relation/modify', {
        form: {
          fid: mid,
          act: 1,
          re_src: reSrc,
          csrf,
        },
      })
    );
    return {
      success: true,
      mid: String(mid),
      reSrc,
    };
  }

  async getUnreadNotifications() {
    requireCookie(this.cookie);
    const data = unwrapBiliResponse(await this.get('https://api.bilibili.com/x/msgfeed/unread'));
    return normalizeUnreadNotifications(data);
  }

  async getReplyNotifications({ id, replyTime, build = 0, mobiApp = 'web', platform = 'web' } = {}) {
    requireCookie(this.cookie);
    const data = unwrapBiliResponse(
      await this.get('https://api.bilibili.com/x/msgfeed/reply', {
        query: {
          build,
          mobi_app: mobiApp,
          id,
          reply_time: replyTime,
          platform,
          web_location: 333.999,
        },
      })
    );
    return normalizeReplyNotifications(data);
  }

  async listDmSessions({ sessionType = 1, groupFold = 1, unfollowFold = 0, sortRule = 2, build = 0, mobiApp = 'web' } = {}) {
    requireCookie(this.cookie);
    const data = unwrapBiliResponse(
      await this.get('https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions', {
        query: {
          session_type: sessionType,
          group_fold: groupFold,
          unfollow_fold: unfollowFold,
          sort_rule: sortRule,
          build,
          mobi_app: mobiApp,
        },
      })
    );
    return normalizeDmSessions(data);
  }

  async getDmMessages({ talkerId, sessionType = 1, beginSeqno = 0, size = 20, build = 0, mobiApp = 'web' }) {
    requireCookie(this.cookie);
    const data = unwrapBiliResponse(
      await this.get('https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs', {
        query: {
          talker_id: talkerId,
          session_type: sessionType,
          begin_seqno: beginSeqno,
          size,
          build,
          mobi_app: mobiApp,
        },
      })
    );
    return normalizeDmMessages(data);
  }

  async ackDmSession({ talkerId, sessionType = 1, ackSeqno }) {
    requireCookie(this.cookie);
    const session = readSession();
    const selfUid = session.userInfo?.mid || (await this.getUserInfo()).mid;
    const data = unwrapBiliResponse(
      await this.post('https://api.vc.bilibili.com/session_svr/v1/session_svr/update_ack', {
        form: {
          talker_id: talkerId,
          session_type: sessionType,
          ack_seqno: ackSeqno,
          csrf: requireCsrf(this.cookie),
          csrf_token: requireCsrf(this.cookie),
          build: 0,
          mobi_app: 'web',
          sender_device_id: session.devId || '',
          sender_uid: selfUid,
        },
      })
    );
    return {
      success: true,
      talkerId: String(talkerId),
      ackSeqno,
      raw: data,
    };
  }

  async sendDmText({ receiverId, content, receiverType = 1 }) {
    requireCookie(this.cookie);
    const csrf = requireCsrf(this.cookie);
    const session = readSession();
    const selfUid = session.userInfo?.mid || (await this.getUserInfo()).mid;
    const devId = session.devId || crypto.randomUUID();
    if (!session.devId) {
      patchSession({ ...session, devId });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const query = await signWbiParams(
      {
        w_sender_uid: selfUid,
        w_receiver_id: receiverId,
        w_dev_id: devId,
      },
      this
    );

    const data = unwrapBiliResponse(
      await this.post('https://api.vc.bilibili.com/web_im/v1/web_im/send_msg', {
        query,
        form: {
          'msg[sender_uid]': selfUid,
          'msg[receiver_id]': receiverId,
          'msg[receiver_type]': receiverType,
          'msg[msg_type]': 1,
          'msg[msg_status]': 0,
          'msg[dev_id]': devId,
          'msg[timestamp]': timestamp,
          'msg[new_face_version]': 1,
          'msg[content]': JSON.stringify({ content }),
          csrf,
          csrf_token: csrf,
        },
      })
    );
    return {
      success: true,
      receiverId: String(receiverId),
      receiverType,
      devId,
      timestamp,
      msgKey: data.msg_key,
      raw: data,
    };
  }

  async uploadDmImage(filePath) {
    requireCookie(this.cookie);
    const csrf = requireCsrf(this.cookie);
    const absolutePath = path.resolve(filePath);
    const fileBuffer = fs.readFileSync(absolutePath);
    const stats = fs.statSync(absolutePath);
    const dimensions = imageSize(fileBuffer);
    const ext = path.extname(absolutePath).replace(/^\./, '').toLowerCase() || 'png';
    const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png';
    const form = new FormData();
    form.append('binary', new Blob([fileBuffer], { type: mime }), path.basename(absolutePath));
    form.append('csrf', csrf);

    // Inference from Bilibili web editor behavior: this upload path returns a Bilibili-hosted image URL.
    const data = unwrapBiliResponse(
      await this.postMultipart('https://api.bilibili.com/x/article/creative/article/upcover', {
        form,
      })
    );

    return {
      success: true,
      path: absolutePath,
      url: data.url,
      width: dimensions.width || 0,
      height: dimensions.height || 0,
      imageType: ext === 'jpg' ? 'jpeg' : ext,
      original: 1,
      size: Math.round((stats.size / 1024) * 1000) / 1000,
      raw: data,
    };
  }

  async sendDmImage({ receiverId, imagePath, receiverType = 1 }) {
    requireCookie(this.cookie);
    const csrf = requireCsrf(this.cookie);
    const session = readSession();
    const selfUid = session.userInfo?.mid || (await this.getUserInfo()).mid;
    const devId = session.devId || crypto.randomUUID();
    if (!session.devId) {
      patchSession({ ...session, devId });
    }

    const uploaded = await this.uploadDmImage(imagePath);
    const timestamp = Math.floor(Date.now() / 1000);
    const query = await signWbiParams(
      {
        w_sender_uid: selfUid,
        w_receiver_id: receiverId,
        w_dev_id: devId,
      },
      this
    );

    const data = unwrapBiliResponse(
      await this.post('https://api.vc.bilibili.com/web_im/v1/web_im/send_msg', {
        query,
        form: {
          'msg[sender_uid]': selfUid,
          'msg[receiver_id]': receiverId,
          'msg[receiver_type]': receiverType,
          'msg[msg_type]': 2,
          'msg[msg_status]': 0,
          'msg[dev_id]': devId,
          'msg[timestamp]': timestamp,
          'msg[new_face_version]': 1,
          'msg[content]': JSON.stringify({
            url: uploaded.url,
            height: uploaded.height,
            width: uploaded.width,
            imageType: uploaded.imageType,
            original: uploaded.original,
            size: uploaded.size,
          }),
          csrf,
          csrf_token: csrf,
        },
      })
    );

    return {
      success: true,
      receiverId: String(receiverId),
      receiverType,
      devId,
      timestamp,
      msgKey: data.msg_key,
      image: uploaded,
      raw: data,
    };
  }
}

module.exports = {
  BilibiliClient,
};
