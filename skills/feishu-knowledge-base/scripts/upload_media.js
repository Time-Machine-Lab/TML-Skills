const fs = require('fs');
const path = require('path');
const https = require('https');

const CREDENTIALS_PATH = path.join(__dirname, '../config/credentials.yaml');

function toAsciiFallbackFilename(name) {
    const base = String(name || 'file');
    // Keep filename safe for plain filename= header.
    const cleaned = base.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '_');
    return cleaned || 'file';
}

function encodeRFC5987(value) {
    return encodeURIComponent(String(value || ''))
        .replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

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
    return creds;
}

function requestMultipart(url, headers, parts) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, { method: 'POST', headers }, (res) => {
            res.setEncoding('utf8');
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON response: ${body}`));
                }
            });
        });

        req.on('error', reject);

        for (const part of parts) {
            req.write(part.header, 'utf8');
            if (part.filePath) {
                const fileBuffer = fs.readFileSync(part.filePath);
                req.write(fileBuffer);
                req.write('\r\n', 'utf8');
            } else {
                req.write(String(part.value), 'utf8');
                req.write('\r\n', 'utf8');
            }
        }

        req.write(parts.boundaryEnd, 'utf8');
        req.end();
    });
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.log(`
Usage: node scripts/upload_media.js <file_path> <parent_type> <parent_node> [file_name]

Description:
  Upload a local file to Feishu Drive via:
  POST /open-apis/drive/v1/medias/upload_all

Arguments:
  <file_path>    Local file absolute/relative path
  <parent_type>  Usually "explorer"
  <parent_node>  Target folder token in Feishu Drive
  [file_name]    Optional custom name in Feishu; defaults to local file name

Example:
  node scripts/upload_media.js "D:/docs/spec.pdf" explorer fldcnxxxxxxxxxxxx
`);
        process.exit(1);
    }

    const filePath = args[0];
    const parentType = args[1];
    const parentNode = args[2];
    const fileName = args[3] || path.basename(filePath);

    if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
    }

    const creds = readCredentials();
    const accessToken = creds['access_token'];
    if (!accessToken) {
        console.error('❌ access_token not found. Run `node scripts/auth.js status` then authorize if needed.');
        process.exit(1);
    }

    const size = fs.statSync(filePath).size;
    const boundary = `----feishuBoundary${Date.now()}`;
    const asciiFileName = toAsciiFallbackFilename(fileName);
    const utf8FileName = encodeRFC5987(fileName);

    const parts = [
        {
            header: `--${boundary}\r\nContent-Disposition: form-data; name="file_name"\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n`,
            value: fileName
        },
        {
            header: `--${boundary}\r\nContent-Disposition: form-data; name="parent_type"\r\n\r\n`,
            value: parentType
        },
        {
            header: `--${boundary}\r\nContent-Disposition: form-data; name="parent_node"\r\n\r\n`,
            value: parentNode
        },
        {
            header: `--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n`,
            value: size
        },
        {
            header: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${asciiFileName}"; filename*=UTF-8''${utf8FileName}\r\nContent-Type: application/octet-stream\r\n\r\n`,
            filePath
        }
    ];
    parts.boundaryEnd = `--${boundary}--\r\n`;

    let contentLength = Buffer.byteLength(parts.boundaryEnd, 'utf8');
    for (const part of parts) {
        contentLength += Buffer.byteLength(part.header, 'utf8');
        if (part.filePath) {
            contentLength += fs.statSync(part.filePath).size + 2;
        } else {
            contentLength += Buffer.byteLength(String(part.value), 'utf8') + 2;
        }
    }

    try {
        const res = await requestMultipart(
            'https://open.feishu.cn/open-apis/drive/v1/medias/upload_all',
            {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': contentLength
            },
            parts
        );

        console.log(JSON.stringify(res, null, 2));
        if (res.code !== 0) {
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ Upload failed:', err.message);
        process.exit(1);
    }
}

main();
