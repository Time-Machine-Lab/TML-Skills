const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawnSync } = require('child_process');

const IMAGE_BLOCK_TYPE = 27;
const MAX_DOWNLOAD_REDIRECTS = 5;

function usage() {
    console.log(`
Usage:
  node scripts/process_images.js <markdown_or_html_path> <document_id> [--content-type markdown|html]

Description:
  End-to-end pipeline for content with images:
  1) convert markdown/html -> blocks
  2) create blocks in document
  3) download & upload image binaries to corresponding image blocks
  4) patch image blocks with replace_image token

Example:
  node scripts/process_images.js "D:/docs/README.md" "U8Vqd9wKzoYrUSxdavUc6SvZnvb" --content-type markdown
`);
}

function parseArgs(argv) {
    if (argv.length < 2) {
        usage();
        process.exit(1);
    }
    const filePath = argv[0];
    const documentId = argv[1];

    let contentType = 'markdown';
    const idx = argv.indexOf('--content-type');
    if (idx >= 0 && argv[idx + 1]) {
        contentType = argv[idx + 1].toLowerCase();
    }
    if (!['markdown', 'html'].includes(contentType)) {
        throw new Error(`Invalid --content-type: ${contentType}`);
    }
    return { filePath, documentId, contentType };
}

function parseJsonFromMixedOutput(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (_) {
        // fall through
    }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        return JSON.parse(raw.slice(start, end + 1));
    }
    return null;
}

function runNode(scriptAbsPath, args, stdinText = null) {
    const result = spawnSync('node', [scriptAbsPath, ...args], {
        encoding: 'utf8',
        input: stdinText || undefined,
        maxBuffer: 50 * 1024 * 1024
    });

    const mergedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;
    const parsed = parseJsonFromMixedOutput(mergedOutput);

    if (result.status !== 0) {
        const err = new Error(`Command failed: node ${path.basename(scriptAbsPath)} ${args.join(' ')}`);
        err.status = result.status;
        err.stdout = result.stdout || '';
        err.stderr = result.stderr || '';
        err.response = parsed;
        throw err;
    }

    return parsed || mergedOutput.trim();
}

function runApiRequest(method, url, payloadObj = null) {
    const apiScript = path.join(__dirname, 'api_request.js');
    const payload = payloadObj ? JSON.stringify(payloadObj) : null;
    const res = runNode(apiScript, [method, url], payload);
    if (!res || typeof res !== 'object') {
        throw new Error(`api_request returned non-json response for ${method} ${url}`);
    }
    return res;
}

function runUploadMedia(localPath, blockId, fileName) {
    const uploadScript = path.join(__dirname, 'upload_media.js');
    const args = [localPath, 'docx_image', blockId];
    if (fileName) args.push(fileName);
    const res = runNode(uploadScript, args);
    if (!res || typeof res !== 'object') {
        throw new Error('upload_media returned non-json response');
    }
    return res;
}

function extractImageUrl(imageData) {
    if (!imageData) return '';
    if (typeof imageData === 'string') return imageData;
    if (typeof imageData.image_url === 'string') return imageData.image_url;
    if (typeof imageData.url === 'string') return imageData.url;
    return '';
}

function sanitizeBlocksForCreate(blocks) {
    function walk(node) {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) return node.map(walk);
        const out = {};
        for (const [k, v] of Object.entries(node)) {
            if (k === 'merge_info') continue;
            out[k] = walk(v);
        }
        return out;
    }
    return walk(blocks);
}

function collectAllBlockIds(items) {
    const ids = new Set();
    for (const it of items || []) {
        if (it && it.block_id) ids.add(it.block_id);
    }
    return ids;
}

function listAllBlocks(documentId) {
    const allItems = [];
    let pageToken = '';
    let guard = 0;
    while (guard < 100) {
        guard += 1;
        const url = pageToken
            ? `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks?page_size=500&page_token=${encodeURIComponent(pageToken)}`
            : `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks?page_size=500`;
        const res = runApiRequest('GET', url);
        if (!res || res.code !== 0 || !res.data) {
            throw new Error(`List blocks failed: ${JSON.stringify(res)}`);
        }
        const items = Array.isArray(res.data.items) ? res.data.items : [];
        allItems.push(...items);
        if (!res.data.has_more || !res.data.page_token) break;
        pageToken = res.data.page_token;
    }
    return allItems;
}

function detectNewImageBlockIds(beforeItems, afterItems) {
    const beforeIds = collectAllBlockIds(beforeItems);
    return (afterItems || [])
        .filter((b) => b && b.block_id && !beforeIds.has(b.block_id) && b.block_type === IMAGE_BLOCK_TYPE)
        .map((b) => b.block_id);
}

function toSafeFileName(urlStr, idx) {
    try {
        const u = new URL(urlStr);
        const raw = path.basename(u.pathname || '') || `image_${idx}`;
        return raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || `image_${idx}`;
    } catch (_) {
        return `image_${idx}.bin`;
    }
}

function requestOnce(urlStr, timeoutMs) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const lib = u.protocol === 'http:' ? http : https;
        const req = lib.get(urlStr, { timeout: timeoutMs }, (res) => {
            resolve(res);
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy(new Error('download timeout'));
        });
    });
}

async function downloadWithRedirects(urlStr, localPath, redirectsLeft = MAX_DOWNLOAD_REDIRECTS) {
    const response = await requestOnce(urlStr, 15000);
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        if (redirectsLeft <= 0) {
            throw new Error(`too many redirects: ${urlStr}`);
        }
        response.resume();
        const nextUrl = new URL(response.headers.location, urlStr).toString();
        return downloadWithRedirects(nextUrl, localPath, redirectsLeft - 1);
    }
    if (response.statusCode !== 200) {
        response.resume();
        throw new Error(`download failed with status ${response.statusCode}`);
    }

    await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(localPath);
        response.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
        response.on('error', reject);
    });
}

function isRateLimitError(res) {
    if (!res || typeof res !== 'object') return false;
    const msg = String(res.msg || '').toLowerCase();
    return res.code === 99991400 || msg.includes('rate') || msg.includes('too many');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function patchReplaceImageWithRetry(documentId, blockId, fileToken) {
    const url = `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${blockId}`;
    const payload = { replace_image: { token: fileToken } };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const res = runApiRequest('PATCH', url, payload);
        if (res.code === 0) return res;
        if (isRateLimitError(res) && attempt < 3) {
            await sleep(500 * attempt);
            continue;
        }
        throw new Error(`replace_image failed for block ${blockId}: ${JSON.stringify(res)}`);
    }
    throw new Error(`replace_image failed after retry for block ${blockId}`);
}

async function main() {
    const { filePath, documentId, contentType } = parseArgs(process.argv.slice(2));

    if (!fs.existsSync(filePath)) {
        throw new Error(`input file not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');

    console.log('[INFO] Step 1/4 converting content to blocks...');
    const convertRes = runApiRequest('POST', 'https://open.feishu.cn/open-apis/docx/v1/documents/blocks/convert', {
        content_type: contentType,
        content
    });
    if (!convertRes || convertRes.code !== 0 || !convertRes.data) {
        throw new Error(`convert failed: ${JSON.stringify(convertRes)}`);
    }

    const blocks = Array.isArray(convertRes.data.blocks) ? convertRes.data.blocks : [];
    const imageMap = convertRes.data.block_id_to_image_urls || {};
    const imagePlaceholders = Object.keys(imageMap);
    if (blocks.length === 0) {
        throw new Error('convert returned empty blocks');
    }

    console.log('[INFO] Step 2/4 creating blocks into target document...');
    const beforeItems = listAllBlocks(documentId);
    const createRes = runApiRequest(
        'POST',
        `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
        { children: sanitizeBlocksForCreate(blocks) }
    );
    if (!createRes || createRes.code !== 0) {
        throw new Error(`create blocks failed: ${JSON.stringify(createRes)}`);
    }
    const afterItems = listAllBlocks(documentId);

    if (imagePlaceholders.length === 0) {
        console.log('[SUCCESS] Content inserted. No images found in markdown/html.');
        return;
    }

    const targetImageBlockIds = detectNewImageBlockIds(beforeItems, afterItems);
    if (targetImageBlockIds.length < imagePlaceholders.length) {
        throw new Error(
            `image block mapping mismatch: placeholders=${imagePlaceholders.length}, created_image_blocks=${targetImageBlockIds.length}`
        );
    }

    console.log(`[INFO] Step 3/4 uploading ${imagePlaceholders.length} images...`);
    const failures = [];
    const uploads = [];

    for (let i = 0; i < imagePlaceholders.length; i += 1) {
        const placeholderId = imagePlaceholders[i];
        const blockId = targetImageBlockIds[i];
        const imageUrl = extractImageUrl(imageMap[placeholderId]);

        if (!imageUrl) {
            failures.push({ index: i, block_id: blockId, placeholder_id: placeholderId, error: 'missing image url' });
            continue;
        }

        const tempPath = path.join(os.tmpdir(), `feishu-kb-img-${Date.now()}-${i}-${toSafeFileName(imageUrl, i)}`);
        try {
            await downloadWithRedirects(imageUrl, tempPath);
            const uploadRes = runUploadMedia(tempPath, blockId, toSafeFileName(imageUrl, i));
            const token = uploadRes && uploadRes.data && uploadRes.data.file_token;
            if (uploadRes.code !== 0 || !token) {
                failures.push({
                    index: i,
                    block_id: blockId,
                    placeholder_id: placeholderId,
                    image_url: imageUrl,
                    error: `upload failed: ${JSON.stringify(uploadRes)}`
                });
                continue;
            }
            uploads.push({ block_id: blockId, file_token: token, placeholder_id: placeholderId, image_url: imageUrl });
        } catch (err) {
            failures.push({
                index: i,
                block_id: blockId,
                placeholder_id: placeholderId,
                image_url: imageUrl,
                error: err.message
            });
        } finally {
            if (fs.existsSync(tempPath)) {
                try { fs.unlinkSync(tempPath); } catch (_) { /* ignore */ }
            }
        }
    }

    console.log('[INFO] Step 4/4 patching image blocks (replace_image)...');
    for (const item of uploads) {
        try {
            await patchReplaceImageWithRetry(documentId, item.block_id, item.file_token);
        } catch (err) {
            failures.push({
                block_id: item.block_id,
                placeholder_id: item.placeholder_id,
                image_url: item.image_url,
                error: err.message
            });
        }
    }

    const summary = {
        document_id: documentId,
        total_images: imagePlaceholders.length,
        uploaded: uploads.length,
        failed: failures.length,
        failures
    };

    if (failures.length > 0) {
        console.error('[ERROR] Image pipeline completed with failures.');
        console.error(JSON.stringify(summary, null, 2));
        process.exit(1);
    }

    console.log('[SUCCESS] Markdown/HTML image pipeline completed.');
    console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
});
