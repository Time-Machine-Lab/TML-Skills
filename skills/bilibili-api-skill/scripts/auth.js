'use strict';

const { parseArgs } = require('./lib/args');
const { ok, fail } = require('./lib/output');
const { CliError } = require('./lib/errors');
const { readCredentials } = require('./lib/config');
const { generateQrCode, pollQrCode, checkCookieRefresh, refreshCookie } = require('./lib/auth');
const { readSession } = require('./lib/store');

async function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const [action] = positionals;
  const credentials = readCredentials();
  const userAgent = options['user-agent'] || credentials.userAgent;

  if (!action) {
    throw new CliError('用法: node scripts/auth.js <qr-generate|qr-poll|refresh-check|refresh> [--key <qrcode_key>]');
  }

  if (action === 'qr-generate') {
    ok(await generateQrCode({ userAgent }));
    return;
  }

  if (action === 'qr-poll') {
    ok(await pollQrCode({ qrcodeKey: options.key, userAgent }));
    return;
  }
  if (action === 'refresh-check') {
    const session = readSession();
    ok(await checkCookieRefresh({ cookie: options.cookie || credentials.cookie || session.cookie, userAgent }));
    return;
  }
  if (action === 'refresh') {
    const session = readSession();
    ok(
      await refreshCookie({
        cookie: options.cookie || credentials.cookie || session.cookie,
        refreshToken: options['refresh-token'] || session.refreshToken || '',
        userAgent,
      })
    );
    return;
  }

  throw new CliError(`不支持的 auth action: ${action}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error : new Error(String(error)));
  process.exit(error.exitCode || 1);
});
