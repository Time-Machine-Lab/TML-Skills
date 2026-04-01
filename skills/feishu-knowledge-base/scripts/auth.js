const fs = require('fs');
const path = require('path');
const https = require('https');

const CREDENTIALS_PATH = path.join(__dirname, '../config/credentials.yaml');

// Parse simple YAML
function readCredentials() {
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    const creds = {};
    const lines = content.split('\n');
    for (const line of lines) {
        const match = line.match(/^([\w-]+):\s*"?([^"]*?)"?\s*$/);
        if (match) {
            creds[match[1]] = match[2];
        }
    }
    return { creds, content };
}

// Write simple YAML
function writeCredentials(content, newCreds) {
    let newContent = content;
    for (const [key, val] of Object.entries(newCreds)) {
        if (!val) continue;
        const regex = new RegExp(`^(${key}):\\s*"?([^"]*?)"?\\s*$`, 'm');
        if (regex.test(newContent)) {
            newContent = newContent.replace(regex, `${key}: "${val}"`);
        } else {
            newContent += `\n${key}: "${val}"`;
        }
    }
    fs.writeFileSync(CREDENTIALS_PATH, newContent, 'utf-8');
}

// Request helper
function request(urlStr, options, data = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(urlStr, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON: ${body}`));
                }
            });
        });
        req.on('error', reject);
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function getAppAccessToken(appId, appSecret) {
    const res = await request('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
    }, { app_id: appId, app_secret: appSecret });
    if (res.code === 0) {
        return res.tenant_access_token; // For internal apps, returns app_access_token / tenant_access_token
    }
    return null;
}

async function refreshToken() {
    const { creds, content } = readCredentials();
    const appId = creds['app-id'];
    const appSecret = creds['app-secret'];
    const refreshToken = creds['refresh_token'];

    if (!appId || !appSecret) {
        console.error('Missing app-id or app-secret in credentials.yaml');
        process.exit(1);
    }

    if (!refreshToken) {
        console.error('❌ refresh_token is missing. This usually happens when the skill is newly installed. Please run `node scripts/auth.js url` to authorize first.');
        process.exit(1);
    }

    const headers = { 'Content-Type': 'application/json; charset=utf-8' };

    // Attempt to get app_access_token proactively to prevent 20014 error
    const appToken = await getAppAccessToken(appId, appSecret);
    if (appToken) {
        headers['Authorization'] = `Bearer ${appToken}`;
    }

    const res = await request('https://open.feishu.cn/open-apis/authen/v1/oidc/refresh_access_token', {
        method: 'POST',
        headers
    }, {
        grant_type: 'refresh_token',
        client_id: appId,
        client_secret: appSecret,
        refresh_token: refreshToken
    });

    if (res.code === 0) {
        writeCredentials(content, {
            access_token: res.data.access_token,
            refresh_token: res.data.refresh_token
        });
        console.log('✅ Token refreshed successfully! credentials.yaml has been updated.');
    } else {
        console.error('❌ Failed to refresh token:', res);
    }
}

function getAuthUrl() {
    const { creds } = readCredentials();
    const appId = creds['app-id'];
    const redirectUri = encodeURIComponent(creds['redirect_uri'] || '');
    const scope = encodeURIComponent(creds['scope'] || '');

    const url = `https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=${appId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&state=random123`;
    console.log('🔗 Please open the following URL in your browser to authorize:');
    console.log('\n' + url + '\n');
}

function showStatus() {
    const { creds } = readCredentials();
    const hasAppId = Boolean(creds['app-id']);
    const hasAppSecret = Boolean(creds['app-secret']);
    const hasAccessToken = Boolean(creds['access_token']);
    const hasRefreshToken = Boolean(creds['refresh_token']);

    console.log('Feishu Auth Status:');
    console.log(`- app-id: ${hasAppId ? 'configured' : 'missing'}`);
    console.log(`- app-secret: ${hasAppSecret ? 'configured' : 'missing'}`);
    console.log(`- access_token: ${hasAccessToken ? 'configured' : 'missing'}`);
    console.log(`- refresh_token: ${hasRefreshToken ? 'configured' : 'missing'}`);

    if (!hasAppId || !hasAppSecret) {
        console.log('\nAction: fill app-id/app-secret in config/credentials.yaml');
        return;
    }

    if (!hasAccessToken || !hasRefreshToken) {
        console.log('\nAction: run `node scripts/auth.js url`, then `node scripts/auth.js token <code>`');
        return;
    }

    console.log('\nAction: credentials are ready. If API reports token expired, run `node scripts/auth.js refresh`.');
}

async function getToken(code) {
    const { creds, content } = readCredentials();
    const appId = creds['app-id'];
    const appSecret = creds['app-secret'];
    const redirectUri = creds['redirect_uri'];

    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    const appToken = await getAppAccessToken(appId, appSecret);
    if (appToken) {
        headers['Authorization'] = `Bearer ${appToken}`;
    }

    const res = await request('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
        method: 'POST',
        headers
    }, {
        grant_type: 'authorization_code',
        client_id: appId,
        client_secret: appSecret,
        code: code,
        redirect_uri: redirectUri
    });

    if (res.code === 0) {
        writeCredentials(content, {
            access_token: res.data.access_token,
            refresh_token: res.data.refresh_token
        });
        console.log('✅ Token acquired successfully! credentials.yaml has been updated.');
    } else {
        console.error('❌ Failed to get token:', res);
    }
}

const command = process.argv[2];

async function main() {
    try {
        if (command === 'refresh') {
            await refreshToken();
        } else if (command === 'status') {
            showStatus();
        } else if (command === 'url') {
            getAuthUrl();
        } else if (command === 'token') {
            const code = process.argv[3];
            if (!code) {
                console.error('❌ Please provide the authorization code: node auth.js token <code>');
                process.exit(1);
            }
            await getToken(code);
        } else {
            console.log(`
Usage: node scripts/auth.js <command>

Commands:
  status        Show auth credential readiness
  url           Generate the authorization URL
  token <code>  Exchange the authorization code for tokens
  refresh       Refresh the user_access_token using the stored refresh_token
`);
        }
    } catch (err) {
        console.error('Error:', err.message);
    }
}

main();
