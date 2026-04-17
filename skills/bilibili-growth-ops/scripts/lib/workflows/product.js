'use strict';

const fs = require('fs');
const path = require('path');
const { CliError } = require('../errors');
const { nowIso } = require('../output');
const {
  ensureDir,
  exists,
  readText,
  writeText,
  copyFile,
  slugify,
  uniqueId,
} = require('../runtime/files');
const { loadRuntimeTemplate, renderTemplate } = require('../runtime/templates');

function appendUnderHeading(markdown, heading, addition) {
  const marker = `## ${heading}`;
  const index = markdown.indexOf(marker);
  if (index === -1) {
    return `${markdown.trimEnd()}\n\n${marker}\n\n${addition}\n`;
  }
  const insertionPoint = markdown.indexOf('\n', index);
  const prefix = markdown.slice(0, insertionPoint + 1);
  const suffix = markdown.slice(insertionPoint + 1);
  return `${prefix}\n${addition}\n${suffix}`;
}

function extractKeywords(input) {
  const matches = String(input || '').match(/[\u4e00-\u9fa5A-Za-z0-9]{2,16}/g) || [];
  const deduped = [];
  for (const item of matches) {
    if (!deduped.includes(item)) {
      deduped.push(item);
    }
    if (deduped.length >= 12) {
      break;
    }
  }
  return deduped;
}

function buildExtraction(title, text, sourceName) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const summary = normalized ? normalized.slice(0, 220) : `Imported material from ${sourceName || title || 'source'}.`;
  return {
    summary,
    keywords: extractKeywords(`${title || ''}\n${normalized}`),
  };
}

function buildInsightDigestLine(productRoot, targetPath, detectedKind, extraction) {
  const parts = [
    `- \`${path.relative(productRoot, targetPath)}\``,
    `(${detectedKind})`,
    `at ${nowIso()}`,
    `summary: ${extraction.summary}`,
  ];
  if (extraction.keywords.length) {
    parts.push(`keywords: ${extraction.keywords.join(', ')}`);
  }
  return parts.join('; ');
}

function createProductWorkspace({ paths, store, name, slug, summary = '' }) {
  const productSlug = slugify(slug || name);
  if (!productSlug) {
    throw new CliError('无法生成有效的产品标识 slug。');
  }

  const existing = store.getProductBySlug(productSlug);
  if (existing) {
    throw new CliError(`产品标识 slug 已存在: ${productSlug}`);
  }

  const productId = uniqueId('product');
  const productRoot = path.join(paths.productsDir, productSlug);
  const assetsDir = path.join(productRoot, 'assets');
  const materialsDir = path.join(productRoot, 'materials');
  const tasksDir = path.join(productRoot, 'tasks');
  const insightPath = path.join(productRoot, 'PRODUCT-INSIGHT.md');
  const insightGuidePath = path.join(paths.productTemplatesDir, 'PRODUCT-INSIGHT-GUIDE.md');

  ensureDir(productRoot);
  ensureDir(assetsDir);
  ensureDir(materialsDir);
  ensureDir(tasksDir);

  const productMarkdown = renderTemplate(loadRuntimeTemplate(paths, 'product', 'PRODUCT.md.tmpl'), {
    productTitle: name,
    productId,
    productSlug,
    productStatus: 'draft',
    createdAt: nowIso(),
    productSummary: summary || '待补充产品介绍。',
  });
  writeText(path.join(productRoot, 'PRODUCT.md'), productMarkdown);
  const insightMarkdown = renderTemplate(loadRuntimeTemplate(paths, 'product', 'PRODUCT-INSIGHT.md.tmpl'), {
    productTitle: name,
    insightGuidePath: path.relative(productRoot, insightGuidePath),
  });
  writeText(insightPath, insightMarkdown);

  const product = store.upsertProduct({
    id: productId,
    slug: productSlug,
    title: name,
    status: 'draft',
    summary,
    resourcePath: productRoot,
    metadata: {
      materialsDir,
      assetsDir,
      tasksDir,
      insightPath,
      insightGuidePath,
      sourceCount: 0,
    },
  });

  return {
    product,
    productRoot,
    assetsDir,
    materialsDir,
    tasksDir,
    insightPath,
    insightGuidePath,
  };
}

function ingestProductMaterial({ store, slug, source, text, title, kind = 'auto' }) {
  const product = store.getProductBySlug(slug);
  if (!product) {
    throw new CliError(`产品不存在: ${slug}`);
  }

  const productRoot = product.resource_path;
  const materialsDir = path.join(productRoot, 'materials');
  ensureDir(materialsDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let sourceName = title || '';
  let contentText = '';
  let targetPath = '';
  let detectedKind = kind;

  if (source) {
    if (!exists(source)) {
      throw new CliError(`资料文件不存在: ${source}`);
    }
    const originalName = path.basename(source);
    sourceName = sourceName || originalName;
    targetPath = path.join(materialsDir, `${timestamp}-${originalName}`);
    copyFile(source, targetPath);

    const extension = path.extname(source).toLowerCase();
    if (['.md', '.txt', '.json', '.yaml', '.yml'].includes(extension)) {
      contentText = fs.readFileSync(source, 'utf8');
    }
    if (kind === 'auto') {
      detectedKind = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extension) ? 'asset' : 'document';
    }
  } else if (text) {
    sourceName = sourceName || 'text-note';
    targetPath = path.join(materialsDir, `${timestamp}-${slugify(sourceName || 'note')}.md`);
    contentText = String(text);
    writeText(targetPath, `# ${sourceName}\n\n${contentText}\n`);
    if (kind === 'auto') {
      detectedKind = 'text';
    }
  } else {
    throw new CliError('product ingest 需要 `source` 或 `text`。');
  }

  const extraction = buildExtraction(sourceName, contentText, path.basename(targetPath));
  const productMdPath = path.join(productRoot, 'PRODUCT.md');
  const existingMarkdown = readText(productMdPath, '');
  let nextMarkdown = appendUnderHeading(
    existingMarkdown,
    'Source Materials',
    `- \`${path.relative(productRoot, targetPath)}\` (${detectedKind}) at ${nowIso()}`
  );
  nextMarkdown = appendUnderHeading(
    nextMarkdown,
    'Working Notes',
    `- Imported \`${path.basename(targetPath)}\`; summary: ${extraction.summary}; keywords: ${extraction.keywords.join(', ')}`
  );
  writeText(productMdPath, nextMarkdown);

  const insightPath = path.join(productRoot, 'PRODUCT-INSIGHT.md');
  const currentInsight = readText(insightPath, '');
  if (currentInsight) {
    const nextInsight = appendUnderHeading(
      currentInsight,
      'Source Queue',
      buildInsightDigestLine(productRoot, targetPath, detectedKind, extraction)
    );
    writeText(insightPath, nextInsight);
  }

  const currentMetadata = product.metadata || {};
  const insightGuidePath =
    currentMetadata.insightGuidePath ||
    path.resolve(productRoot, '..', '..', 'templates', 'product', 'PRODUCT-INSIGHT-GUIDE.md');
  const nextMetadata = {
    ...currentMetadata,
    lastIngestAt: nowIso(),
    sourceCount: Number(currentMetadata.sourceCount || 0) + 1,
    latestKeywords: extraction.keywords,
    insightPath,
    insightGuidePath,
  };
  const nextSummary = product.summary || extraction.summary;
  const updatedProduct = store.upsertProduct({
    id: product.id,
    slug: product.slug,
    title: product.title,
    status: product.status,
    summary: nextSummary,
    resourcePath: product.resource_path,
    metadata: nextMetadata,
    createdAt: product.created_at,
  });

  return {
    product: updatedProduct,
    materialPath: targetPath,
    insightPath,
    insightGuidePath,
    kind: detectedKind,
    extraction,
  };
}

module.exports = {
  createProductWorkspace,
  ingestProductMaterial,
};
