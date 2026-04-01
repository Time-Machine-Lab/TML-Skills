const fs = require('fs');
const path = require('path');
const https = require('https');

const CREDENTIALS_PATH = path.join(__dirname, '../config/credentials.yaml');

function readCredentials() {
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    const creds = {};
    const lines = content.split('\n');
    for (const line of lines) {
        const match = line.match(/^([\w-]+):\s*"?([^"]*?)"?\s*$/);
        if (match) {
            creds[match[1]] = match[2];
        }
    }
    return creds;
}

function writeCredentials(content, updates) {
    let newContent = content;
    for (const [key, val] of Object.entries(updates)) {
        if (!val) continue;
        const regex = new RegExp(`^(${key}):\\s*"?([^"]*?)"?\\s*$`, 'm');
        if (regex.test(newContent)) {
            newContent = newContent.replace(regex, `${key}: "${val}"`);
        } else {
            newContent += `\n${key}: "${val}"`;
        }
    }
    fs.writeFileSync(CREDENTIALS_PATH, newContent, 'utf-8');
}

function request(urlStr, options, data = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(urlStr, options, (res) => {
            // Ensure response is treated as UTF-8
            res.setEncoding('utf8');
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    // 如果不是 JSON，直接返回原字符串
                    resolve(body);
                }
            });
        });
        req.on('error', reject);
        if (data) {
            // Buffer.from is used to ensure the length is calculated correctly in bytes, 
            // but for writing to req, JSON string is fine as long as encoding is utf8.
            const payload = JSON.stringify(data);
            req.setHeader('Content-Length', Buffer.byteLength(payload, 'utf8'));
            req.write(payload, 'utf8');
        }
        req.end();
    });
}

async function getAppAccessToken(appId, appSecret) {
    const res = await request('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
    }, { app_id: appId, app_secret: appSecret });
    if (res && res.code === 0) {
        return res.tenant_access_token;
    }
    return null;
}

async function refreshAccessToken(creds) {
    const appId = creds['app-id'];
    const appSecret = creds['app-secret'];
    const refreshToken = creds['refresh_token'];

    if (!appId || !appSecret || !refreshToken) {
        return { ok: false, reason: 'missing-required-credentials' };
    }

    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    const appToken = await getAppAccessToken(appId, appSecret);
    if (appToken) {
        headers['Authorization'] = `Bearer ${appToken}`;
    }

    const res = await request('https://open.feishu.cn/open-apis/authen/v1/oidc/refresh_access_token', {
        method: 'POST',
        headers
    }, {
        grant_type: 'refresh_token',
        client_id: appId,
        client_secret: appSecret,
        refresh_token: refreshToken
    });

    if (res && res.code === 0 && res.data && res.data.access_token) {
        const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
        writeCredentials(content, {
            access_token: res.data.access_token,
            refresh_token: res.data.refresh_token
        });
        return { ok: true, accessToken: res.data.access_token };
    }

    return { ok: false, reason: 'refresh-failed', response: res };
}

function isTokenExpiredError(res) {
    if (!res || typeof res !== 'object' || res.code === 0 || res.code === undefined) {
        return false;
    }

    const tokenErrorCodes = new Set([99991672, 99991663, 20010, 20014]);
    if (tokenErrorCodes.has(res.code)) {
        return true;
    }

    const msg = String(res.msg || '').toLowerCase();
    return msg.includes('token') && (msg.includes('expired') || msg.includes('invalid'));
}

async function main() {
    let bodyStr = '';

    // Check if we have data piped from stdin
    if (!process.stdin.isTTY) {
        try {
            bodyStr = await new Promise((resolve, reject) => {
                let data = '';
                process.stdin.on('data', chunk => data += chunk);
                process.stdin.on('end', () => resolve(data));
                process.stdin.on('error', reject);
            });
            bodyStr = bodyStr.trim();
        } catch (e) {
            // Ignore error, continue to check arguments
        }
    }

    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log(`
Usage: node scripts/api_request.js <METHOD> <URL> [JSON_BODY_STRING]
   Or: node scripts/api_request.js <METHOD> <URL> --base64 <BASE64_ENCODED_JSON>

Description:
  A generic API requester that automatically injects the access_token from credentials.yaml.
  Use this instead of writing temporary js scripts or curl commands.

Example:
  node scripts/api_request.js GET "https://open.feishu.cn/open-apis/docx/v1/documents/doc_xxx"
  node scripts/api_request.js POST "https://open.feishu.cn/open-apis/docx/v1/documents/doc_xxx/blocks/doc_xxx/children" '{"children":[]}'
  node scripts/api_request.js POST "https://open.feishu.cn/open-apis/docx/v1/documents/doc_xxx/blocks/doc_xxx/children" --base64 eyJjaGlsZHJlbiI6W119
`);
        process.exit(1);
    }

    const method = args[0].toUpperCase();
    const url = args[1];

    // Check for base64 encoded body
    if (args[2] === '--base64' && args[3]) {
        bodyStr = Buffer.from(args[3], 'base64').toString('utf-8');
    } else if (!bodyStr && args[2]) {
        // If bodyStr is empty from stdin and not base64, try to get it from args
        bodyStr = args[2];
    }

    const creds = readCredentials();
    let accessToken = creds['access_token'];

    if (!accessToken) {
        console.error('❌ access_token not found in credentials.yaml. This usually happens when the skill is newly installed. Please run `node scripts/auth.js url` to authorize first.');
        process.exit(1);
    }

    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=utf-8'
        }
    };

    let data = null;
    if (bodyStr) {
        try {
            if (bodyStr.startsWith('@')) {
                console.error('❌ 不支持 @文件 方式读取请求体。请改用 --base64 传递 JSON，避免产生临时文件。');
                process.exit(1);
            }
            data = JSON.parse(bodyStr);
        } catch (e) {
            console.error('❌ Invalid JSON body provided:', e.message);
            process.exit(1);
        }
    }

    try {
        let res = await request(url, options, data);

        if (isTokenExpiredError(res)) {
            console.error('⚠️ 检测到 access_token 可能已过期，尝试自动刷新并重试一次...');
            const refreshResult = await refreshAccessToken(creds);
            if (refreshResult.ok) {
                accessToken = refreshResult.accessToken;
                options.headers.Authorization = `Bearer ${accessToken}`;
                res = await request(url, options, data);
                console.error('✅ token 自动刷新成功，已完成重试。');
            } else {
                if (refreshResult.reason === 'missing-required-credentials') {
                    console.error('❌ 无法自动刷新：credentials.yaml 中缺少 app-id/app-secret/refresh_token。请先执行 node scripts/auth.js url 完成首次授权。');
                } else {
                    console.error('❌ 自动刷新失败，请执行 node scripts/auth.js refresh 或重新授权（node scripts/auth.js url）。');
                }
            }
        }

        // 自动拦截节点列表查询并更新缓存
        if (method === 'GET') {
            try {
                const cacheDir = path.join(__dirname, '../.cache');
                const cacheFile = path.join(cacheDir, 'nodes_cache.json');

                if (!fs.existsSync(cacheDir)) {
                    fs.mkdirSync(cacheDir, { recursive: true });
                }

                let diskCache = { childrenMap: {}, spaces: [] };
                if (fs.existsSync(cacheFile)) {
                    diskCache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                }
                if (!diskCache.childrenMap) diskCache.childrenMap = {};
                if (!diskCache.spaces) diskCache.spaces = [];

                // 拦截知识空间列表查询
                if (url.includes('/wiki/v2/spaces') && !url.includes('/nodes') && !url.includes('/get_node')) {
                    // 确保是查询列表接口，且不带多余路径参数（简单的匹配，忽略 query 参数）
                    const urlObj = new URL(url);
                    if (urlObj.pathname === '/open-apis/wiki/v2/spaces') {
                        if (res && res.code === 0 && res.data && res.data.items) {
                            const spaceMap = new Map();
                            diskCache.spaces.forEach(s => spaceMap.set(s.space_id, s));
                            res.data.items.forEach(s => spaceMap.set(s.space_id, s));
                            diskCache.spaces = Array.from(spaceMap.values());
                            fs.writeFileSync(cacheFile, JSON.stringify(diskCache, null, 2), 'utf-8');
                        }
                    }
                }

                // 拦截节点列表查询
                if (url.includes('/wiki/v2/spaces/') && url.includes('/nodes')) {
                    const match = url.match(/\/wiki\/v2\/spaces\/([^\/]+)\/nodes/);
                    if (match && res && res.code === 0 && res.data && res.data.items) {
                        const spaceId = match[1];
                        const urlObj = new URL(url);
                        const parentNodeToken = urlObj.searchParams.get('parent_node_token') || '';

                        if (!diskCache.childrenMap[spaceId]) diskCache.childrenMap[spaceId] = {};

                        let existing = diskCache.childrenMap[spaceId][parentNodeToken] || [];
                        const itemMap = new Map();
                        existing.forEach(item => itemMap.set(item.node_token, item));
                        res.data.items.forEach(item => itemMap.set(item.node_token, item));

                        diskCache.childrenMap[spaceId][parentNodeToken] = Array.from(itemMap.values());
                        fs.writeFileSync(cacheFile, JSON.stringify(diskCache, null, 2), 'utf-8');
                    }
                }
            } catch (e) {
                // Ignore cache update errors silently so it doesn't break the response
            }
        }

        // 自动拦截知识空间创建操作并更新缓存
        if (method === 'POST') {
            try {
                const urlObj = new URL(url);
                if (urlObj.pathname === '/open-apis/wiki/v2/spaces') {
                    if (res && res.code === 0 && res.data && res.data.space) {
                        const cacheDir = path.join(__dirname, '../.cache');
                        const cacheFile = path.join(cacheDir, 'nodes_cache.json');

                        if (!fs.existsSync(cacheDir)) {
                            fs.mkdirSync(cacheDir, { recursive: true });
                        }

                        let diskCache = { childrenMap: {}, spaces: [] };
                        if (fs.existsSync(cacheFile)) {
                            diskCache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                        }
                        if (!diskCache.spaces) diskCache.spaces = [];

                        const spaceMap = new Map();
                        diskCache.spaces.forEach(s => spaceMap.set(s.space_id, s));
                        spaceMap.set(res.data.space.space_id, res.data.space);

                        diskCache.spaces = Array.from(spaceMap.values());
                        fs.writeFileSync(cacheFile, JSON.stringify(diskCache, null, 2), 'utf-8');
                    }
                }
            } catch (e) {
                // Ignore cache update errors silently
            }
        }

        // 拦截并处理权限不足的错误
        if (res && res.code !== undefined && res.code !== 0) {
            // 常见的权限错误码: 
            // 131006 / 400131006 / 131004 (invalid user) / 20010002 (网络异常但有时是越权) 等
            const permissionErrors = [131006, 400131006, 131004, 400131004];
            if (permissionErrors.includes(res.code) || String(res.msg).toLowerCase().includes('permission')) {
                console.log(JSON.stringify(res, null, 2));
                console.error('\n⚠️ [Permission Denied] 抱歉，当前用户没有足够的权限执行此操作（或目标资源不存在/不可见）。');
                console.error('👉 Agent 指令：请直接向用户转达“当前无权限执行此操作”，无需尝试重试或其他绕过手段。');
                return;
            }
        }

        console.log(JSON.stringify(res, null, 2));
    } catch (err) {
        console.error('❌ Request failed:', err.message);
        process.exit(1);
    }
}

main();
