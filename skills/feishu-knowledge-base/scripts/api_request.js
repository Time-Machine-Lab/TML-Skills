const fs = require('fs');
const path = require('path');
const https = require('https');

const CREDENTIALS_PATH = path.join(__dirname, '../config/credentials.yaml');

function readCredentials() {
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    const creds = {};
    const lines = content.split('\n');
    for (const line of lines) {
        const match = line.match(/^([\w-]+):\s*"(.*?)"/);
        if (match) {
            creds[match[1]] = match[2];
        }
    }
    return creds;
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
   Or: echo '{"key":"value"}' | node scripts/api_request.js <METHOD> <URL>

Description:
  A generic API requester that automatically injects the access_token from credentials.yaml.
  Use this instead of writing temporary js scripts or curl commands.

Example:
  node scripts/api_request.js GET "https://open.feishu.cn/open-apis/docx/v1/documents/doc_xxx"
  node scripts/api_request.js POST "https://open.feishu.cn/open-apis/docx/v1/documents/doc_xxx/blocks" '{"children":[]}'
  cat data.json | node scripts/api_request.js POST "https://open.feishu.cn/open-apis/docx/v1/documents/doc_xxx/blocks"
`);
        process.exit(1);
    }

    const method = args[0].toUpperCase();
    const url = args[1];

    // If bodyStr is empty from stdin, try to get it from args
    if (!bodyStr && args[2]) {
        bodyStr = args[2];
    }

    const creds = readCredentials();
    const accessToken = creds['access_token'];

    if (!accessToken) {
        console.error('❌ access_token not found in credentials.yaml');
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
                const filePath = bodyStr.substring(1);
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                data = JSON.parse(fileContent);
            } else {
                data = JSON.parse(bodyStr);
            }
        } catch (e) {
            console.error('❌ Invalid JSON body provided:', e.message);
            process.exit(1);
        }
    }

    try {
        const res = await request(url, options, data);

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
