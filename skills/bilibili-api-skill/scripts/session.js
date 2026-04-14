'use strict';

const { parseArgs } = require('./lib/args');
const { ok, fail } = require('./lib/output');
const { CliError } = require('./lib/errors');
const { readSession, readSecrets } = require('./lib/store');
const { readCredentials } = require('./lib/config');
const { buildSessionSummary } = require('./lib/session');
const { hydrateSession, checkCookieRefresh, refreshCookie } = require('./lib/auth');

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const [action] = positionals;
  const credentials = readCredentials();
  const session = readSession();

  if (!action) {
    throw new CliError('用法: node scripts/session.js <show|hydrate|refresh-check|refresh>');
  }

  if (action === 'show') {
    ok({
      summary: buildSessionSummary(session),
      hasSecrets: Boolean(readSecrets().cookie || readSecrets().refreshToken),
    });
    return;
  }

  if (action === 'hydrate') {
    const cookie = options.cookie || credentials.cookie || session.cookie;
    if (!cookie) {
      throw new CliError('缺少 Cookie。请通过 --cookie 或现有配置提供。');
    }
    ok(
      await hydrateSession({
        cookie,
        refreshToken: options['refresh-token'] || session.refreshToken || '',
        userAgent: options['user-agent'] || credentials.userAgent,
        qrcodeKey: options.key || session.qrcodeKey || '',
        loginUrl: session.loginUrl || '',
      })
    );
    return;
  }
  if (action === 'refresh-check') {
    ok(await checkCookieRefresh({ cookie: options.cookie || credentials.cookie || session.cookie, userAgent: options['user-agent'] || credentials.userAgent }));
    return;
  }
  if (action === 'refresh') {
    ok(
      await refreshCookie({
        cookie: options.cookie || credentials.cookie || session.cookie,
        refreshToken: options['refresh-token'] || session.refreshToken || '',
        userAgent: options['user-agent'] || credentials.userAgent,
      })
    );
    return;
  }

  throw new CliError(`不支持的 session action: ${action}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error : new Error(String(error)));
  process.exit(error.exitCode || 1);
});
