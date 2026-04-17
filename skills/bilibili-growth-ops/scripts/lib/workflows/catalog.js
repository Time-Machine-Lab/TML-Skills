'use strict';

const path = require('path');
const { listDirectories, readJson, readText, exists } = require('../runtime/files');

const SECTION_ALIASES = {
  Purpose: 'Purpose',
  用途: 'Purpose',
  'When To Use': 'When To Use',
  何时使用: 'When To Use',
  Preconditions: 'Preconditions',
  前置条件: 'Preconditions',
  Inputs: 'Inputs',
  输入: 'Inputs',
  Outputs: 'Outputs',
  产出: 'Outputs',
  'Execution Steps': 'Execution Steps',
  执行步骤: 'Execution Steps',
  'Decision Rules': 'Decision Rules',
  判断规则: 'Decision Rules',
  'Allowed Commands': 'Allowed Commands',
  '允许使用的指令': 'Allowed Commands',
  'Do Not': 'Do Not',
  禁止事项: 'Do Not',
  'Done When': 'Done When',
  完成标志: 'Done When',
  'If Blocked': 'If Blocked',
  受阻处理: 'If Blocked',
  Positioning: 'Positioning',
  定位: 'Positioning',
  'Core Composition': 'Core Composition',
  核心构成: 'Core Composition',
  'Global Working Rules': 'Global Working Rules',
  全局工作规则: 'Global Working Rules',
  'Stage Playbook': 'Stage Playbook',
  阶段打法: 'Stage Playbook',
  'Prompt Guidance': 'Prompt Guidance',
  提示词导向: 'Prompt Guidance',
  'Review Policy': 'Review Policy',
  审核规则: 'Review Policy',
  'Main Agent Duties': 'Main Agent Duties',
  '主 Agent 职责': 'Main Agent Duties',
  'Subagent Duties': 'Subagent Duties',
  '副 Agent 职责': 'Subagent Duties',
  Do: 'Do',
  建议做法: 'Do',
};

function parseFrontmatter(markdown) {
  const source = String(markdown || '');
  if (!source.startsWith('---\n')) {
    return {
      metadata: {},
      body: source,
    };
  }

  const endIndex = source.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    return {
      metadata: {},
      body: source,
    };
  }

  const rawFrontmatter = source.slice(4, endIndex);
  const body = source.slice(endIndex + 5);
  const metadata = {};
  let currentListKey = '';

  for (const line of rawFrontmatter.split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed.trim()) {
      continue;
    }

    const listMatch = trimmed.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentListKey) {
      if (!Array.isArray(metadata[currentListKey])) {
        metadata[currentListKey] = [];
      }
      metadata[currentListKey].push(listMatch[1].trim());
      continue;
    }

    const scalarMatch = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!scalarMatch) {
      currentListKey = '';
      continue;
    }

    const [, key, value] = scalarMatch;
    if (!value) {
      metadata[key] = [];
      currentListKey = key;
      continue;
    }

    metadata[key] = value.trim();
    currentListKey = '';
  }

  return {
    metadata,
    body,
  };
}

function summarizeMarkdown(markdown) {
  const firstLine = String(markdown || '')
    .split('\n')
    .find((line) => line.trim());
  return firstLine ? firstLine.replace(/^#+\s*/, '') : '';
}

function parseSections(markdown) {
  const sections = {};
  let currentTitle = '';
  let buffer = [];

  for (const line of String(markdown || '').split('\n')) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      if (currentTitle) {
        sections[currentTitle] = buffer.join('\n').trim();
      }
      const rawTitle = headingMatch[1].trim();
      currentTitle = SECTION_ALIASES[rawTitle] || rawTitle;
      buffer = [];
      continue;
    }

    if (currentTitle) {
      buffer.push(line);
    }
  }

  if (currentTitle) {
    sections[currentTitle] = buffer.join('\n').trim();
  }

  return sections;
}

function listCapabilities(paths) {
  return listDirectories(paths.capabilitiesDir).map((slug) => {
    const root = path.join(paths.capabilitiesDir, slug);
    const source = readText(path.join(root, 'CAPABILITY.md'), '');
    const parsed = parseFrontmatter(source);
    const sections = parseSections(parsed.body);
    return {
      slug: parsed.metadata.slug || slug,
      title: summarizeMarkdown(parsed.body),
      path: root,
      metadata: parsed.metadata,
      summary: sections.Purpose || '',
    };
  });
}

function getCapability(paths, slug) {
  const root = path.join(paths.capabilitiesDir, slug);
  if (!exists(root)) {
    return null;
  }
  const source = readText(path.join(root, 'CAPABILITY.md'), '');
  const parsed = parseFrontmatter(source);
  return {
    slug: parsed.metadata.slug || slug,
    path: root,
    markdown: parsed.body,
    metadata: parsed.metadata,
    sections: parseSections(parsed.body),
  };
}

function listStrategies(paths) {
  return listDirectories(paths.strategiesDir).map((slug) => {
    const root = path.join(paths.strategiesDir, slug);
    const source = readText(path.join(root, 'STRATEGY.md'), '');
    const parsed = parseFrontmatter(source);
    const sections = parseSections(parsed.body);
    const strategy = readJson(path.join(root, 'strategy.json'), {});
    return {
      slug,
      title: strategy.displayName || summarizeMarkdown(parsed.body),
      path: root,
      mode: strategy.mode || 'review-first',
      stageCount: Array.isArray(strategy.stages) ? strategy.stages.length : 0,
      summary: sections.Positioning || '',
    };
  });
}

function getStrategy(paths, slug) {
  const root = path.join(paths.strategiesDir, slug);
  if (!exists(root)) {
    return null;
  }
  const source = readText(path.join(root, 'STRATEGY.md'), '');
  const parsed = parseFrontmatter(source);
  return {
    slug,
    path: root,
    markdown: parsed.body,
    metadata: parsed.metadata,
    sections: parseSections(parsed.body),
    strategy: readJson(path.join(root, 'strategy.json'), {}),
  };
}

module.exports = {
  parseFrontmatter,
  parseSections,
  listCapabilities,
  getCapability,
  listStrategies,
  getStrategy,
};
