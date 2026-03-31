#!/usr/bin/env node

const { searchWallhaven } = require('./search');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const eq = token.indexOf('=');
    if (eq !== -1) {
      const key = token.slice(2, eq);
      const value = token.slice(eq + 1);
      out[key] = value;
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    process.stdout.write(
      [
        'Wallhaven search skill (CLI)',
        '',
        'Usage:',
        '  node skills/wallhaven/cli.js --q "风景" --sorting date_added --categories 111 --purity 100 --atleast 2560x1080 --ratios 16x9 --order desc --colors 990000 --page 2',
        '',
        'Options:',
        '  --q            搜索关键词（必填）',
        '  --sorting      favorites|relevance|random|toplist|hot|date_added',
        '  --topRange     1d|3d|1w|1M|3M|1y（仅 --sorting toplist 可用）',
        '  --categories   三位 0/1，默认 111',
        '  --purity       默认 100',
        '  --ratios       可多选，用逗号分隔',
        '  --atleast      默认 1920x1080',
        '  --order        asc|desc，默认 desc',
        '  --colors       单选，可为空；枚举：60000,990000,CC0000,CC3333,EA4C88,993399,663399,333399,0066CC,0099CC,66CCCC,77CC33,669900,336600,666600,999900,CCCC33,FFFF00,FFCC33,FF9900,FF6600,CC6633,996633,663300,000000,999999,CCCCCC,FFFFFF,424153',
        '  --page         页码',
        '  --direct       是否返回直链图片；默认 true；传 --direct false 则输出详情页链接',
        '  --timeout      单次请求超时（毫秒），默认 20000',
        '  --timeoutMs    同 --timeout',
        '  --proxy        HTTP 代理，例如 127.0.0.1:7890 或 http://127.0.0.1:7890',
        '                未传且环境变量也未设置时，会尝试自动使用 http://127.0.0.1:7890（若端口可用）',
        '',
      ].join('\n')
    );
    return;
  }

  try {
    const links = await searchWallhaven({
      q: args.q,
      sorting: args.sorting,
      topRange: args.topRange,
      categories: args.categories,
      purity: args.purity,
      ratios: args.ratios,
      atleast: args.atleast,
      order: args.order,
      colors: args.colors,
      page: args.page,
      direct: args.direct,
      timeoutMs: args.timeoutMs != null ? args.timeoutMs : args.timeout,
      proxy: args.proxy,
    });

    process.stdout.write(JSON.stringify(links, null, 2));
  } catch (err) {
    process.stderr.write(String(err && err.stack ? err.stack : err));
    process.stderr.write('\n');
    process.exitCode = 1;
  }
}

main();
