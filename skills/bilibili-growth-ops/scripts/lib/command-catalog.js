'use strict';

const path = require('path');

const catalogPath = path.join(__dirname, '..', '..', 'assets', 'catalog', 'commands.json');
const rawCatalog = require(catalogPath);

function toCliRef(entry) {
  return `${entry.group}.${entry.command}`;
}

function toUsage(entry) {
  return entry.usage || `node scripts/ops.js ${entry.group} ${entry.command}`;
}

function enrichEntry(entry) {
  const cliRef = toCliRef(entry);
  const resultId = entry.resultId || cliRef.replace(/-/g, '_');
  const aliases = new Set([
    cliRef,
    resultId,
    `${entry.group} ${entry.command}`,
    cliRef.replace(/-/g, '_'),
  ]);

  return {
    ...entry,
    cliRef,
    resultId,
    usage: toUsage(entry),
    aliases: Array.from(aliases),
  };
}

function listCatalogEntries() {
  return (rawCatalog.commands || []).map(enrichEntry);
}

function buildLookup(entries) {
  const lookup = new Map();
  entries.forEach((entry) => {
    entry.aliases.forEach((alias) => {
      lookup.set(String(alias).trim().toLowerCase(), entry);
    });
  });
  return lookup;
}

function normalizeRefs(ids) {
  return String(ids || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function findEntryByRef(ref, lookup) {
  const normalized = String(ref || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (lookup.has(normalized)) {
    return lookup.get(normalized);
  }

  const spaceMatch = normalized.match(/^([a-z0-9_-]+)\s+([a-z0-9_-]+)$/i);
  if (spaceMatch) {
    const candidate = `${spaceMatch[1]}.${spaceMatch[2]}`;
    if (lookup.has(candidate)) {
      return lookup.get(candidate);
    }
  }

  const dotMatch = normalized.match(/^([a-z0-9_-]+)\.([a-z0-9_-]+)$/i);
  if (dotMatch) {
    const group = dotMatch[1];
    const tail = dotMatch[2];
    const candidates = [`${group}.${tail.replace(/_/g, '-')}`, `${group}.${tail.replace(/-/g, '_')}`];
    for (const candidate of candidates) {
      if (lookup.has(candidate)) {
        return lookup.get(candidate);
      }
    }
  }

  return null;
}

function summarizeEntry(entry) {
  return {
    key: entry.key,
    title: entry.title,
    summary: entry.summary,
    group: entry.group,
    command: entry.command,
    resultId: entry.resultId,
    usage: entry.usage,
    writesOperationRecord: Boolean(entry.writesOperationRecord),
  };
}

function explainEntry(entry) {
  return {
    key: entry.key,
    title: entry.title,
    summary: entry.summary,
    group: entry.group,
    command: entry.command,
    resultId: entry.resultId,
    usage: entry.usage,
    requiredOptions: entry.requiredOptions || [],
    optionalOptions: entry.optionalOptions || [],
    writesOperationRecord: Boolean(entry.writesOperationRecord),
    notes: entry.notes || [],
    aliases: entry.aliases,
  };
}

function listCommands({ group } = {}) {
  return listCatalogEntries()
    .filter((entry) => (!group ? true : entry.group === String(group).trim()))
    .map(summarizeEntry);
}

function explainCommands({ ids, group } = {}) {
  const entries = listCatalogEntries();
  const filtered = !group ? entries : entries.filter((entry) => entry.group === String(group).trim());
  const lookup = buildLookup(filtered);
  const refs = normalizeRefs(ids);

  const items = [];
  const missing = [];
  for (const ref of refs) {
    const entry = findEntryByRef(ref, lookup);
    if (!entry) {
      missing.push(ref);
      continue;
    }
    if (!items.find((item) => item.key === entry.key)) {
      items.push(explainEntry(entry));
    }
  }

  return {
    items,
    missing,
  };
}

module.exports = {
  listCommands,
  explainCommands,
  listCatalogEntries,
};
