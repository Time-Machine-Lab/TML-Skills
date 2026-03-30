const fs = require('fs');
const path = require('path');

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

function syncCache(action, spaceId, parentNodeToken, nodeDataStr) {
    const diskCache = loadCache();

    if (!diskCache.childrenMap[spaceId]) {
        diskCache.childrenMap[spaceId] = {};
    }
    const childrenCache = diskCache.childrenMap[spaceId];
    const parentKey = parentNodeToken || '';

    if (action === 'add') {
        let nodeData;
        try {
            nodeData = JSON.parse(nodeDataStr);
        } catch (e) {
            throw new Error(`Invalid JSON string for nodeData: ${nodeDataStr}`);
        }

        if (!childrenCache[parentKey]) {
            childrenCache[parentKey] = [];
        }

        // 检查是否已经存在（防止重复添加）
        const existingIndex = childrenCache[parentKey].findIndex(n => n.node_token === nodeData.node_token);
        if (existingIndex !== -1) {
            childrenCache[parentKey][existingIndex] = nodeData; // Update
        } else {
            childrenCache[parentKey].push(nodeData); // Insert
        }

        console.log(`[INFO] Cache updated: Added node "${nodeData.title || nodeData.node_token}" to parent "${parentKey}" in space ${spaceId}`);
        saveCache(diskCache);

    } else if (action === 'delete') {
        const targetNodeToken = nodeDataStr; // For delete, the 4th arg is just the node_token

        if (childrenCache[parentKey]) {
            const initialLength = childrenCache[parentKey].length;
            childrenCache[parentKey] = childrenCache[parentKey].filter(n => n.node_token !== targetNodeToken);

            if (childrenCache[parentKey].length < initialLength) {
                console.log(`[INFO] Cache updated: Removed node "${targetNodeToken}" from parent "${parentKey}" in space ${spaceId}`);

                // 级联删除：如果这个节点下面还有子节点缓存，一并清空
                if (childrenCache[targetNodeToken]) {
                    delete childrenCache[targetNodeToken];
                    console.log(`[INFO] Cascading delete: Cleared cached children of "${targetNodeToken}"`);
                }

                saveCache(diskCache);
            } else {
                console.log(`[INFO] Cache sync skipped: Node "${targetNodeToken}" not found under parent "${parentKey}"`);
            }
        }
    } else {
        throw new Error(`Unknown action: ${action}. Supported actions are 'add', 'delete'.`);
    }
}

const args = process.argv.slice(2);
if (args.length < 4) {
    console.log(`
Usage: node scripts/sync_cache.js <action> <space_id> <parent_node_token> <node_data_or_token>

Description:
  Manually syncs the local file-based cache after a node is created or deleted via API.

Actions:
  add       Adds or updates a node in the cache. <node_data_or_token> must be a JSON string of the node object.
  delete    Removes a node from the cache. <node_data_or_token> must be the node_token to remove.

Arguments:
  <action>               'add' or 'delete'
  <space_id>             The ID of the space
  <parent_node_token>    The parent node token (use "" or "root" for top-level nodes)
  <node_data_or_token>   JSON string (for 'add') or node_token (for 'delete')

Example:
  node scripts/sync_cache.js add 12345 "parent_abc" '{"node_token":"xyz", "title":"New Doc"}'
  node scripts/sync_cache.js delete 12345 "parent_abc" "xyz"
`);
    process.exit(1);
}

const action = args[0];
const spaceId = args[1];
const parentNodeToken = args[2] === 'root' ? '' : args[2];
const nodeDataOrToken = args[3];

try {
    syncCache(action, spaceId, parentNodeToken, nodeDataOrToken);
} catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
}
