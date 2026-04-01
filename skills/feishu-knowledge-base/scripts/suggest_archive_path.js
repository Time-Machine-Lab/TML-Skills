const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../.cache/nodes_cache.json');

function normalizeText(text) {
    return String(text || '').toLowerCase();
}

function tokenize(text) {
    return normalizeText(text)
        .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2);
}

function uniq(arr) {
    return Array.from(new Set(arr));
}

function buildSpaceNodePaths(childrenByParent) {
    const result = [];
    const queue = [{ parentToken: '', parentPath: '' }];

    while (queue.length > 0) {
        const { parentToken, parentPath } = queue.shift();
        const children = childrenByParent[parentToken] || [];

        for (const node of children) {
            const title = node.title || '';
            const currentPath = parentPath ? `${parentPath}/${title}` : title;
            result.push({
                node_token: node.node_token,
                title,
                path: currentPath
            });
            queue.push({ parentToken: node.node_token, parentPath: currentPath });
        }
    }

    return result;
}

function scoreSpace(space, nodes, docText, docTokens) {
    let score = 0;
    const reasons = [];

    const spaceName = normalizeText(space.name || '');
    const spaceDesc = normalizeText(space.description || '');

    if (spaceName && docText.includes(spaceName)) {
        score += 40;
        reasons.push(`命中知识库名称: ${space.name}`);
    }

    const descTokens = uniq(tokenize(spaceDesc)).slice(0, 8);
    let descHitCount = 0;
    for (const t of descTokens) {
        if (docTokens.includes(t)) {
            descHitCount += 1;
        }
    }
    if (descHitCount > 0) {
        score += Math.min(30, descHitCount * 8);
        reasons.push(`命中知识库描述关键词 ${descHitCount} 个`);
    }

    let bestNode = null;
    let bestNodeScore = -1;
    if (!nodes || nodes.length === 0) {
        reasons.push('该知识库暂无本地节点缓存，建议先同步节点后再精确路由');
    }
    for (const node of nodes) {
        const nodeTitle = normalizeText(node.title);
        const nodePath = normalizeText(node.path);
        let nodeScore = 0;

        if (nodeTitle && docText.includes(nodeTitle)) {
            nodeScore += 18;
        }

        const nodeTitleTokens = uniq(tokenize(node.title)).slice(0, 6);
        let tokenHits = 0;
        for (const t of nodeTitleTokens) {
            if (docTokens.includes(t)) tokenHits += 1;
        }
        nodeScore += Math.min(16, tokenHits * 4);

        const pathTokens = uniq(tokenize(node.path)).slice(0, 10);
        let pathHits = 0;
        for (const t of pathTokens) {
            if (docTokens.includes(t)) pathHits += 1;
        }
        nodeScore += Math.min(20, pathHits * 2);

        // Slightly prefer non-root descriptive paths.
        if ((node.path.match(/\//g) || []).length >= 1) {
            nodeScore += 2;
        }

        if (nodeScore > bestNodeScore) {
            bestNodeScore = nodeScore;
            bestNode = node;
        }
    }

    score += Math.max(0, bestNodeScore);
    if (bestNode && bestNodeScore > 0) {
        reasons.push(`最匹配路径: ${bestNode.path}`);
    }

    return { score, reasons, bestNode, bestNodeScore };
}

function shouldFallbackToRoot(bestNode, bestNodeScore) {
    // If path-level evidence is weak, do not force an arbitrary folder.
    // This avoids strange picks like "归档/..." when no real folder match exists.
    if (!bestNode) return true;
    return bestNodeScore < 12;
}

function confidenceLabel(top, second) {
    if (!top) return 'low';
    const gap = top.score - (second ? second.score : 0);
    if (top.score >= 55 && gap >= 15) return 'high';
    if (top.score >= 35 && gap >= 8) return 'medium';
    return 'low';
}

function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log(`
Usage: node scripts/suggest_archive_path.js <doc_title> <doc_content_or_summary> [--top N]

Description:
  Suggest the best knowledge-base space/path for document archiving
  based on existing spaces descriptions and cached node paths.

Example:
  node scripts/suggest_archive_path.js "Q2 任务交接说明" "交接上线事项、负责人、风险回顾" --top 3
`);
        process.exit(1);
    }

    const docTitle = args[0];
    const docContent = args[1];
    const topIdx = args.indexOf('--top');
    const topN = topIdx >= 0 && args[topIdx + 1] ? Number(args[topIdx + 1]) : 3;

    if (!fs.existsSync(CACHE_FILE)) {
        console.error('❌ nodes_cache.json not found. Please sync cache first.');
        process.exit(1);
    }

    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    const spaces = cache.spaces || [];
    const childrenMap = cache.childrenMap || {};

    const docText = normalizeText(`${docTitle} ${docContent}`);
    const docTokens = uniq(tokenize(`${docTitle} ${docContent}`));

    const candidates = [];

    for (const space of spaces) {
        const spaceId = space.space_id;
        const spaceChildren = childrenMap[spaceId] || {};
        const nodePaths = buildSpaceNodePaths(spaceChildren);
        const { score, reasons, bestNode, bestNodeScore } = scoreSpace(space, nodePaths, docText, docTokens);
        const fallbackRoot = shouldFallbackToRoot(bestNode, bestNodeScore);
        if (fallbackRoot) {
            reasons.push('未命中明确文件夹，回退到知识库根目录');
        }

        candidates.push({
            space_id: spaceId,
            space_name: space.name || '',
            score,
            target_node_token: fallbackRoot ? '' : bestNode.node_token,
            target_path: fallbackRoot ? '/' : bestNode.path,
            reasons
        });
    }

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates[0];
    const second = candidates[1];
    const confidence = confidenceLabel(top, second);

    const result = {
        input: {
            doc_title: docTitle,
            content_length: String(docContent || '').length
        },
        confidence,
        recommendation: top || null,
        alternatives: candidates.slice(1, Math.max(1, topN)),
        notes: [
            'If user does not specify archive location, directly archive by recommendation.',
            'If target path seems stale, refresh node cache and retry.'
        ]
    };

    console.log(JSON.stringify(result, null, 2));
}

main();
