const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const port = Number(process.env.PORT || 3000);
const apiBaseUrl = process.env.API_BASE_URL || 'http://api-gateway:3000';
const authGoogleClientId = process.env.AUTH_GOOGLE_CLIENT_ID || '';
const authTelegramBotUsername = process.env.AUTH_TELEGRAM_BOT_USERNAME || '';

const publicDir = path.join(__dirname, '..', 'public');

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function proxyApiRequest(req, res, url) {
  const upstreamUrl = `${apiBaseUrl}${url.pathname}${url.search}`;
  const method = req.method || 'GET';
  const bodyBuffer = method === 'GET' || method === 'HEAD' ? undefined : await readRequestBody(req);
  const contentType = req.headers['content-type'];
  const authorization = req.headers.authorization;
  const accept = req.headers.accept;

  const upstreamHeaders = {};
  if (contentType) upstreamHeaders['content-type'] = contentType;
  if (authorization) upstreamHeaders.authorization = authorization;
  if (accept) upstreamHeaders.accept = accept;

  const upstreamRes = await fetch(upstreamUrl, {
    method,
    headers: upstreamHeaders,
    body: bodyBuffer
  });

  const responseBody = Buffer.from(await upstreamRes.arrayBuffer());
  const responseHeaders = {
    'content-type': upstreamRes.headers.get('content-type') || 'application/octet-stream',
    'content-length': String(responseBody.length)
  };
  const ttsModel = upstreamRes.headers.get('x-tts-model');
  const ttsChunks = upstreamRes.headers.get('x-tts-chunks');
  const recapPreview = upstreamRes.headers.get('x-recap-preview');
  if (ttsModel) responseHeaders['x-tts-model'] = ttsModel;
  if (ttsChunks) responseHeaders['x-tts-chunks'] = ttsChunks;
  if (recapPreview) responseHeaders['x-recap-preview'] = recapPreview;

  res.writeHead(upstreamRes.status, responseHeaders);
  res.end(responseBody);
}

async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { status: 'ok', service: 'frontend-prototype' });
    }

    if (req.method === 'GET' && url.pathname === '/config') {
      return sendJson(res, 200, {
        apiBaseUrl,
        authGoogleClientId,
        authTelegramBotUsername
      });
    }

    if (url.pathname.startsWith('/api/')) {
      return proxyApiRequest(req, res, url);
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await fs.readFile(path.join(publicDir, 'index.html'), 'utf-8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, { error: message });
  }
}

const server = http.createServer((req, res) => {
  handler(req, res).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, { error: message });
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`frontend-prototype listening on :${port}`);
});
