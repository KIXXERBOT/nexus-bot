const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const MIME = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};

function proxyRequest(hostname, target, method, headers, body, res) {
  const options = {
    hostname, port: 443, path: target, method,
    headers: {...headers, 'host': hostname, 'Content-Length': body.length},
  };
  const proxyReq = https.request(options, proxyRes => {
    if ([301,302,307,308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
      const loc = new URL(proxyRes.headers.location);
      return proxyRequest(loc.hostname, loc.pathname + loc.search, method, headers, body, res);
    }
    res.writeHead(proxyRes.statusCode, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
    proxyRes.pipe(res, {end:true});
  });
  proxyReq.on('error', err => {
    res.writeHead(502, {'Content-Type':'application/json'});
    res.end(JSON.stringify({retCode:-1, retMsg:err.message}));
  });
  if (body.length > 0) proxyReq.write(body);
  proxyReq.end();
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-BAPI-API-KEY, X-BAPI-TIMESTAMP, X-BAPI-RECV-WINDOW, X-BAPI-SIGN');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pname = url.pathname;

  if (pname.startsWith('/proxy')) {
    const target = pname.replace('/proxy', '') + url.search;
    const chunks = [];
    req.on('data', d => chunks.push(d));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const fwdHeaders = {
        'Content-Type': 'application/json',
        'User-Agent': 'NexusBot/2.0',
      };
      for (const h of ['x-bapi-api-key','x-bapi-timestamp','x-bapi-recv-window','x-bapi-sign']) {
        if (req.headers[h]) fwdHeaders[h] = req.headers[h];
      }
      proxyRequest('api.bybit.com', target, req.method, fwdHeaders, body, res);
    });
    return;
  }

  const safePath = path.normalize(pname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safePath === '/' ? 'index.html' : safePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, {'Content-Type':'text/html'});
        res.end(d2);
      });
      return;
    }
    res.writeHead(200, {'Content-Type': MIME[path.extname(filePath)] || 'text/plain'});
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`NEXUS BOT running on port ${PORT}`));
