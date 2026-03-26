/**
 * NEXUS BOT — Lokaler CORS-Proxy
 * 
 * Warum nötig: Browser blocken direkte Anfragen an externe APIs (CORS).
 * Dieser lokale Server leitet alle /proxy/* Anfragen an MEXC weiter.
 * Deine API-Keys verlassen deinen Computer NICHT — alles bleibt lokal.
 * 
 * Start: node server.js
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT = 3000;

const MIME = {
  '.html':'text/html','.js':'application/javascript',
  '.css':'text/css','.json':'application/json',
  '.ico':'image/x-icon'
};

const server = http.createServer((req, res) => {

  // ── CORS ──────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, ApiKey, Request-Time, Signature');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url   = new URL(req.url, `http://localhost:${PORT}`);
  const pname = url.pathname;

  // ── PROXY /proxy/* → contract.mexc.com ───────────────
  if (pname.startsWith('/proxy')) {
    const target = pname.replace('/proxy', '') + url.search;

    // Collect request body
    const chunks = [];
    req.on('data', d => chunks.push(d));
    req.on('end', () => {
      const body = Buffer.concat(chunks);

      const options = {
        hostname: 'contract.mexc.com',
        path:     target,
        method:   req.method,
        headers: {
          'Content-Type':  'application/json',
          'User-Agent':    'NexusBot/2.0',
          'Content-Length': body.length,
        },
      };

      // Forward auth headers from browser
      for (const h of ['apikey','request-time','signature']) {
        if (req.headers[h]) options.headers[h] = req.headers[h];
      }

      const proxyReq = https.request(options, proxyRes => {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type':                'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        proxyRes.pipe(res, { end: true });
      });

      proxyReq.on('error', err => {
        console.error('Proxy error:', err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: -1, message: 'Proxy error: ' + err.message }));
      });

      if (body.length > 0) proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }

  // ── STATIC FILES ──────────────────────────────────────
  const safePath = path.normalize(pname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safePath === '/' ? 'index.html' : safePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback: serve index.html for SPA routing
      fs.readFile(path.join(__dirname, 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(d2);
      });
      return;
    }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const line = '═'.repeat(52);
  console.log('\n' + line);
  console.log('  NEXUS BOT — Server gestartet');
  console.log(line);
  console.log(`  Dashboard: http://localhost:${PORT}`);
  console.log(`  MEXC Proxy läuft auf Port ${PORT}`);
  console.log('  Daten bleiben lokal — kein Cloud-Server');
  console.log('  Beenden: Strg+C');
  console.log(line + '\n');

  // Auto-open browser
  const cmds = { win32:'start', darwin:'open', linux:'xdg-open' };
  const cmd  = cmds[process.platform] || 'xdg-open';
  require('child_process').exec(`${cmd} http://localhost:${PORT}`, ()=>{});
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Fehler: Port ${PORT} bereits belegt.`);
    console.error(`  Lösung: Öffne index.html direkt im Browser.\n`);
  } else {
    console.error('Server-Fehler:', err);
  }
  process.exit(1);
});
