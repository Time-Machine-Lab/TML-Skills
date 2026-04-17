'use strict';

const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootstrapTempRuntime, withContext } = require('../support');
const { createProductWorkspace, ingestProductMaterial } = require('../scripts/lib/workflows/product');
const { readText, writeText } = require('../scripts/lib/runtime/files');

test('product workspace includes reusable insight template and ingest queue', () => {
  const runtimeRoot = bootstrapTempRuntime();

  withContext(runtimeRoot, ({ paths, store }) => {
    const runtimeProductTemplatePath = path.join(runtimeRoot, 'resources', 'templates', 'product', 'PRODUCT.md.tmpl');
    const runtimeInsightTemplatePath = path.join(runtimeRoot, 'resources', 'templates', 'product', 'PRODUCT-INSIGHT.md.tmpl');
    writeText(runtimeProductTemplatePath, `${readText(runtimeProductTemplatePath, '')}\nRuntime Product Template Marker\n`);
    writeText(runtimeInsightTemplatePath, `${readText(runtimeInsightTemplatePath, '')}\nRuntime Insight Template Marker\n`);

    const created = createProductWorkspace({
      paths,
      store,
      name: 'Insight Product',
      summary: '用于验证产品洞察模板。',
    });

    const insightPath = path.join(created.productRoot, 'PRODUCT-INSIGHT.md');
    const insightGuidePath = path.join(runtimeRoot, 'resources', 'templates', 'product', 'PRODUCT-INSIGHT-GUIDE.md');
    const productBody = readText(path.join(created.productRoot, 'PRODUCT.md'), '');
    const insightBody = readText(insightPath, '');
    assert.equal(productBody.includes('Runtime Product Template Marker'), true);
    assert.equal(readText(insightGuidePath, '').includes('## 核心提炼维度'), true);
    assert.equal(insightBody.includes('../../templates/product/PRODUCT-INSIGHT-GUIDE.md'), true);
    assert.equal(insightBody.includes('产品信息提炼工作稿'), true);
    assert.equal(insightBody.includes('Runtime Insight Template Marker'), true);

    const ingested = ingestProductMaterial({
      store,
      slug: created.product.slug,
      text: '适合 AI 团队沉淀协作流程，减少重复沟通，提升交付速度。',
      title: '产品补充说明',
    });

    const nextInsightBody = readText(insightPath, '');
    assert.equal(ingested.insightPath, insightPath);
    assert.equal(ingested.insightGuidePath.includes('PRODUCT-INSIGHT-GUIDE.md'), true);
    assert.equal(nextInsightBody.includes('产品补充说明'), true);
    assert.equal(nextInsightBody.includes('交付速度'), true);
  });
});
