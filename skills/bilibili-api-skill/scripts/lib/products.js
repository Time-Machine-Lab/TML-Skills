'use strict';

const fs = require('fs');
const path = require('path');
const { PRODUCTS_DIR, ensureDir } = require('./config');

function ensureProductsDir() {
  ensureDir(PRODUCTS_DIR);
  return PRODUCTS_DIR;
}

function ensureProductSubdirs(dir) {
  ensureDir(path.join(dir, 'docs'));
  ensureDir(path.join(dir, 'images'));
  ensureDir(path.join(dir, 'attachments'));
}

function safeSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function truncateText(value, max = 1600) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

function listFilesInDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
      path: path.join(dirPath, entry.name),
    }));
  } catch {
    return [];
  }
}

function listProducts() {
  ensureProductsDir();
  const entries = fs.readdirSync(PRODUCTS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  return entries.map((entry) => {
    const dir = path.join(PRODUCTS_DIR, entry.name);
    ensureProductSubdirs(dir);
    const briefPath = path.join(dir, 'brief.md');
    const strategyPath = path.join(dir, 'reply-strategy.md');
    const profilePath = path.join(dir, 'product.json');
    let profile = {};
    try {
      profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    } catch {}
    return {
      slug: entry.name,
      path: dir,
      title: profile.title || entry.name,
      hasBrief: fs.existsSync(briefPath),
      hasReplyStrategy: fs.existsSync(strategyPath),
      hasFaq: fs.existsSync(path.join(dir, 'faq.md')),
      files: fs.readdirSync(dir).sort(),
      profile,
    };
  });
}

function getProduct(slug) {
  ensureProductsDir();
  const dir = path.join(PRODUCTS_DIR, slug);
  if (!fs.existsSync(dir)) {
    return null;
  }
  ensureProductSubdirs(dir);
  const files = fs.readdirSync(dir).sort();
  const childDirs = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const profilePath = path.join(dir, 'product.json');
  let profile = {};
  try {
    profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  } catch {}
  return {
    slug,
    path: dir,
    profile,
    files,
    childDirs,
    brief: readTextIfExists(path.join(dir, 'brief.md')),
    replyStrategy: readTextIfExists(path.join(dir, 'reply-strategy.md')),
    faq: readTextIfExists(path.join(dir, 'faq.md')),
    docsPath: path.join(dir, 'docs'),
    imagesPath: path.join(dir, 'images'),
    attachmentsPath: path.join(dir, 'attachments'),
  };
}

function initProduct({ slug, title }) {
  ensureProductsDir();
  const finalSlug = safeSlug(slug || title);
  const dir = path.join(PRODUCTS_DIR, finalSlug);
  ensureDir(dir);
  ensureProductSubdirs(dir);

  const files = {
    'product.json': JSON.stringify(
      {
        title: title || finalSlug,
        audience: [],
        sellingPoints: [],
        disallowedClaims: [],
        preferredTone: 'friendly',
        paths: {
          docs: 'docs',
          images: 'images',
          attachments: 'attachments',
        },
      },
      null,
      2
    ) + '\n',
    'brief.md': `# ${title || finalSlug}\n\n## 产品简介\n\n- 这个产品是做什么的\n- 适合哪些人\n- 解决什么问题\n\n## 核心卖点\n\n- 卖点 1\n- 卖点 2\n- 卖点 3\n`,
    'reply-strategy.md': `# 回复策略\n\n## 评论区回复原则\n\n- 不要一上来太客气太平，要先给一个让人想追问的点\n- 公开区优先抛“坑位 / 差异 / 内部经验”，让用户觉得你真知道门道\n- 先像在点破问题，不要像在做客服\n- 每次都要结合对方原话做改写，不要模板复读\n\n## 适合引导私信的场景\n\n- 用户明确问怎么用、怎么选、怎么省成本\n- 用户在抱怨官方贵、限制多、长期用不起\n- 用户已经表现出持续使用意向\n- 用户在比较多个模型、多个渠道、多个方案\n\n## 不要这样回复\n\n- 纯寒暄、纯共情、纯点赞式回复\n- 一眼广告腔\n- 脱离上下文硬推产品\n- 直接在公开区发群号、二维码或链接\n`,
    'faq.md': `# FAQ\n\n## 常见问题\n\n### 问题 1\n答案\n\n### 问题 2\n答案\n`,
    'docs/context.md': `# 补充资料\n\n把更详细的产品说明、使用场景、案例、对比信息放在这里。\n`,
  };

  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    ensureDir(path.dirname(filePath));
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }

  return getProduct(finalSlug);
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(content || ''), 'utf8');
}

function copyAssetIfProvided(fromPath, toPath) {
  if (!fromPath) {
    return '';
  }
  ensureDir(path.dirname(toPath));
  fs.copyFileSync(fromPath, toPath);
  return toPath;
}

function toList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setupProduct({
  slug,
  title,
  intro = '',
  audience = [],
  sellingPoints = [],
  preferredTone = 'grounded_bilibili',
  groupNumber = '',
  groupLink = '',
  qqNumber = '',
  qrImagePath = '',
  productImages = [],
}) {
  const product = initProduct({ slug, title });
  const profilePath = path.join(product.path, 'product.json');
  const currentProfile = product.profile || {};
  const mergedProfile = {
    ...currentProfile,
    title: title || currentProfile.title || product.slug,
    audience: toList(audience),
    sellingPoints: toList(sellingPoints),
    preferredTone,
    assets: {
      ...(currentProfile.assets || {}),
      groupNumber: String(groupNumber || currentProfile.assets?.groupNumber || ''),
      groupJoinLink: String(groupLink || currentProfile.assets?.groupJoinLink || ''),
      qqNumber: String(qqNumber || currentProfile.assets?.qqNumber || ''),
      qrImageExpectedPath: currentProfile.assets?.qrImageExpectedPath || 'images/qq-group-qrcode.png',
    },
    paths: {
      docs: 'docs',
      images: 'images',
      attachments: 'attachments',
    },
  };
  writeText(profilePath, `${JSON.stringify(mergedProfile, null, 2)}\n`);

  if (intro) {
    writeText(
      path.join(product.path, 'brief.md'),
      `# ${mergedProfile.title}\n\n## 产品简介\n\n${intro}\n\n## 适合人群\n\n${toList(audience).map((item) => `- ${item}`).join('\n') || '- 待补充'}\n\n## 核心卖点\n\n${toList(sellingPoints).map((item) => `- ${item}`).join('\n') || '- 待补充'}\n`
    );
  }

  if (groupNumber || groupLink || qqNumber) {
    writeText(
      path.join(product.path, 'attachments', 'contact.txt'),
      `群号：${groupNumber || ''}\n加群链接：${groupLink || ''}\nQQ号：${qqNumber || ''}\n`
    );
  }

  if (qrImagePath) {
    const ext = path.extname(qrImagePath) || '.png';
    copyAssetIfProvided(qrImagePath, path.join(product.path, 'images', `qq-group-qrcode${ext}`));
  }

  for (const imagePath of toList(productImages)) {
    const target = path.join(product.path, 'images', path.basename(imagePath));
    copyAssetIfProvided(imagePath, target);
  }

  return getProduct(product.slug);
}

function buildProductChecklist(product) {
  if (!product) {
    return [];
  }
  const checks = [
    {
      id: 'brief',
      ok: Boolean(String(product.brief || '').trim()),
      label: 'brief.md 已填写',
      fix: '补充产品简介、目标人群、核心卖点。',
    },
    {
      id: 'reply_strategy',
      ok: Boolean(String(product.replyStrategy || '').trim()),
      label: 'reply-strategy.md 已填写',
      fix: '补充评论区回复原则、私信转化策略、禁用表达。',
    },
    {
      id: 'faq',
      ok: Boolean(String(product.faq || '').trim()),
      label: 'faq.md 已填写',
      fix: '补充常见问题、价格顾虑、适用场景、边界说明。',
    },
    {
      id: 'audience',
      ok: Array.isArray(product.profile?.audience) && product.profile.audience.length > 0,
      label: 'product.json.audience 已配置',
      fix: '在 product.json 里写清目标用户画像。',
    },
    {
      id: 'selling_points',
      ok: Array.isArray(product.profile?.sellingPoints) && product.profile.sellingPoints.length > 0,
      label: 'product.json.sellingPoints 已配置',
      fix: '在 product.json 里列出 3-5 个核心卖点。',
    },
  ];
  return checks;
}

function buildProductDoctor(slug) {
  if (!slug) {
    const products = listProducts();
    return {
      products,
      nextSteps: products.length
        ? ['选择一个产品执行 `node scripts/bili.js product doctor --slug <slug>` 查看资料完整度。']
        : ['先执行 `node scripts/bili.js product init --title "你的产品名"` 创建一个产品资料目录。'],
    };
  }
  const product = getProduct(slug);
  if (!product) {
    return null;
  }
  const checklist = buildProductChecklist(product);
  const missing = checklist.filter((item) => !item.ok);
  return {
    product,
    checklist,
    ready: missing.length === 0,
    nextSteps: missing.length
      ? missing.map((item) => item.fix)
      : ['产品资料基础结构已完整，可以让 agent 直接结合该产品回复评论或私信。'],
  };
}

function summarizeProduct(slug) {
  const product = getProduct(slug);
  if (!product) {
    return null;
  }
  const docs = listFilesInDir(product.docsPath);
  const images = listFilesInDir(product.imagesPath);
  const attachments = listFilesInDir(product.attachmentsPath);
  const profile = product.profile || {};
  const doctor = buildProductDoctor(slug);

  return {
    slug: product.slug,
    title: profile.title || product.slug,
    path: product.path,
    profile,
    readiness: {
      ready: doctor?.ready || false,
      checklist: doctor?.checklist || [],
      missing: (doctor?.checklist || []).filter((item) => !item.ok).map((item) => item.label),
    },
    agentContext: {
      targetAudience: Array.isArray(profile.audience) ? profile.audience : [],
      sellingPoints: Array.isArray(profile.sellingPoints) ? profile.sellingPoints : [],
      disallowedClaims: Array.isArray(profile.disallowedClaims) ? profile.disallowedClaims : [],
      preferredTone: profile.preferredTone || 'friendly',
      replyPrinciples: truncateText(product.replyStrategy, 1800),
      productBrief: truncateText(product.brief, 1800),
      faqSummary: truncateText(product.faq, 1800),
    },
    assets: {
      docs: docs.map((item) => ({ name: item.name, path: item.path })),
      images: images.map((item) => ({ name: item.name, path: item.path })),
      attachments: attachments.map((item) => ({ name: item.name, path: item.path })),
    },
    nextSteps: doctor?.ready
      ? ['产品资料已经具备基础可用性，可以结合 thread continue / thread draft 使用。']
      : doctor?.nextSteps || [],
  };
}

module.exports = {
  ensureProductsDir,
  listProducts,
  getProduct,
  initProduct,
  setupProduct,
  buildProductDoctor,
  summarizeProduct,
};
