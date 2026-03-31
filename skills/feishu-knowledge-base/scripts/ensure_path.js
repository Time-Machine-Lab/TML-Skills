const fs = require('fs');
const path = require('path');
const https = require('https');

const CREDENTIALS_PATH = path.join(__dirname, '../config/credentials.yaml');
const CACHE_DIR = path.join(__dirname, '../.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'nodes_cache.json');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Load cache from disk
function loadCache() {
    if (fs.existsSync(CACHE_FILE)) {
        try {
            const data = fs.readFileSync(CACHE_FILE, 'utf-8');
            return JSON.parse(data);
        } catch (e) {
            console.warn(`[WARN] Failed to parse cache file, starting fresh. ${e.message}`);
        }
    }
    return { childrenMap: {} };
}

// Save cache to disk
function saveCache(cacheObj) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheObj, null, 2), 'utf-8');
    } catch (e) {
        console.warn(`[WARN] Failed to save cache. ${e.message}`);
    }
}

// Parse simple YAML
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

// Request helper
function request(urlStr, options, data = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(urlStr, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON: ${body}`));
                }
            });
        });
        req.on('error', reject);
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

// 获取子节点列表
async function getNodes(spaceId, parentNodeToken, accessToken) {
    let allNodes = [];
    let hasMore = true;
    let pageToken = '';

    while (hasMore) {
        let url = `https://open.feishu.cn/open-apis/wiki/v2/spaces/${spaceId}/nodes?page_size=50`;
        if (parentNodeToken) url += `&parent_node_token=${parentNodeToken}`;
        if (pageToken) url += `&page_token=${pageToken}`;

        const res = await request(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=utf-8'
            }
        });

        if (res.code !== 0) {
            throw new Error(`Failed to get nodes: ${JSON.stringify(res)}`);
        }

        const items = res.data.items || [];
        allNodes = allNodes.concat(items);
        hasMore = res.data.has_more;
        pageToken = res.data.page_token;
    }
    return allNodes;
}

// 创建单个节点
async function createNode(spaceId, parentNodeToken, title, objType, accessToken) {
    const res = await request(`https://open.feishu.cn/open-apis/wiki/v2/spaces/${spaceId}/nodes`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=utf-8'
        }
    }, {
        obj_type: objType,
        node_type: 'origin',
        parent_node_token: parentNodeToken || '',
        title: title
    });

    if (res.code !== 0) {
        throw new Error(`Failed to create node: ${JSON.stringify(res)}`);
    }
    return res.data.node;
}

// 核心逻辑：类似 mkdir -p 创建目录树
async function ensurePath(spaceId, pathStr, isDocument) {
    const creds = readCredentials();
    const accessToken = creds['access_token'];

    if (!accessToken) {
        throw new Error('Access token not found in credentials.yaml');
    }

    // 处理路径: "Folder1/Folder2/MyDoc"
    const parts = pathStr.split('/').filter(p => p.trim() !== '');
    if (parts.length === 0) {
        throw new Error('Path is empty');
    }

    // 优化：一次性拉取整个知识空间的全部节点树（扁平化数组）
    // 相比于逐层查询，这样只需要全量遍历一次，极大减少了 API 的网络请求次数

    // 内部函数：带有持久化存储的带缓存查询
    const diskCache = loadCache();
    // 确保当前 spaceId 的缓存结构存在
    if (!diskCache.childrenMap) {
        diskCache.childrenMap = {};
    }
    if (!diskCache.childrenMap[spaceId]) {
        diskCache.childrenMap[spaceId] = {};
    }
    const childrenCache = diskCache.childrenMap[spaceId]; // parent_token -> [children nodes]

    async function getChildrenCached(parentToken) {
        if (childrenCache[parentToken]) {
            console.log(`[INFO] Cache hit for parent: "${parentToken || 'ROOT'}"`);
            return childrenCache[parentToken];
        }
        console.log(`[INFO] Fetching nodes from API for parent: "${parentToken || 'ROOT'}"`);
        const children = await getNodes(spaceId, parentToken, accessToken);
        childrenCache[parentToken] = children;
        saveCache(diskCache); // 更新后立即持久化到磁盘
        return children;
    }

    let currentNodeToken = ''; // 根目录

    for (let i = 0; i < parts.length; i++) {
        const title = parts[i];
        const isLast = (i === parts.length - 1);
        const objType = (isLast && isDocument) ? 'docx' : 'docx';

        // 使用带持久化缓存的子节点查询
        let existingNodes = await getChildrenCached(currentNodeToken);
        let targetNode = existingNodes.find(n => n.title === title);

        // 如果缓存中没找到，可能是远程已经创建但本地缓存未同步，尝试强制刷新一次缓存
        if (!targetNode) {
            console.log(`[INFO] Node "${title}" not found in cache. Forcing cache refresh from API...`);
            const refreshedNodes = await getNodes(spaceId, currentNodeToken, accessToken);
            childrenCache[currentNodeToken] = refreshedNodes;
            saveCache(diskCache);
            targetNode = refreshedNodes.find(n => n.title === title);
        }

        if (targetNode) {
            console.log(`[INFO] Node "${title}" already exists (Token: ${targetNode.node_token})`);
            currentNodeToken = targetNode.node_token;
        } else {
            console.log(`[INFO] Node "${title}" does not exist. Creating...`);
            targetNode = await createNode(spaceId, currentNodeToken, title, objType, accessToken);
            console.log(`[SUCCESS] Created node "${title}" (Token: ${targetNode.node_token})`);
            currentNodeToken = targetNode.node_token;

            // 更新缓存，避免后续可能的操作重复查询
            const parentKey = targetNode.parent_node_token || ''; // 处理顶级节点父节点为 undefined 或空字符串的情况
            if (!childrenCache[parentKey]) {
                childrenCache[parentKey] = [];
            }
            childrenCache[parentKey].push(targetNode);
            saveCache(diskCache); // 新建节点后持久化更新
        }
    }

    console.log(`\n✅ Final Node Token: ${currentNodeToken}`);
    return currentNodeToken;
}

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log(`
Usage: node scripts/ensure_path.js <space_id> <path> [--doc]

Description:
  Works like "mkdir -p" for Feishu Wiki. It parses the path, checks each level,
  and creates nodes if they don't exist.

Arguments:
  <space_id>    The ID of the Feishu Wiki space.
  <path>        The path to create, e.g. "Project A/Tech Specs/Database Design".
  --doc         Optional. If provided, treats the final part as a document to create.
                (Note: In Feishu Wiki, folders are essentially 'docx' files too)

Example:
  node scripts/ensure_path.js 123456789 "2023/Q1/Reports"
`);
    process.exit(1);
}

const spaceId = args[0];
const pathStr = args[1];
const isDocument = args.includes('--doc');

ensurePath(spaceId, pathStr, isDocument)
    .catch(err => {
        console.error('\n❌ Error:', err.message);
        process.exit(1);
    });
