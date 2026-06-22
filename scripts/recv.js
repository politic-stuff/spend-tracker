// Local receiver for browser->disk handoff (tool-result cap + base64 classifier
// block inline transfer). APPEND mode: each POST body is appended as one JSONL
// line to data/admo-feed.jsonl, so paginated harvests accumulate across the
// page reloads that wipe window state. GET /reset truncates. Localhost only.
const http = require('http');
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'data', 'admo-feed.jsonl');
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && req.url === '/reset') { fs.writeFileSync(out, ''); res.writeHead(200); return res.end('reset'); }
  if (req.method === 'POST') {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => {
      fs.appendFileSync(out, b.trim() + '\n');
      const lines = fs.readFileSync(out, 'utf8').trim().split('\n').filter(Boolean).length;
      res.writeHead(200); res.end('ok ' + b.length + ' lines=' + lines);
      console.log('appended ' + b.length + ' bytes, ' + lines + ' lines total');
    });
  } else { res.writeHead(200); res.end('recv up'); }
}).listen(4179, '127.0.0.1', () => console.log('recv listening on 127.0.0.1:4179'));
