import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)), process.argv[2] ?? '.');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const requestPath = decodeURIComponent(url.pathname);
    let filePath = resolve(root, '.' + requestPath);

    // Prevent directory traversal outside the served root
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        res.writeHead(308, { Location: url.pathname + '/' + url.search }).end();
        return;
      }
      filePath = resolve(filePath, 'index.html');
    }

    const data = await readFile(filePath);
    const contentType = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

const port = Number(process.env.PORT ?? 4186);
server.listen(port, '127.0.0.1', () => {
  console.log(`Kyonami: http://127.0.0.1:${server.address().port}`);
});
