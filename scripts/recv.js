// One-shot local receiver: writes the next POST body to data/flight-raw.json.
// Lets the authenticated browser tab hand off the harvested flight-date map
// without going through the tool-result size cap. Localhost only; CORS-open.
const http = require('http');
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'data', 'flight-raw.json');
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'POST') {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => {
      fs.writeFileSync(out, b);
      res.writeHead(200); res.end('ok ' + b.length);
      console.log('wrote ' + b.length + ' bytes to flight-raw.json');
    });
  } else { res.writeHead(200); res.end('recv up'); }
}).listen(4179, '127.0.0.1', () => console.log('recv listening on 127.0.0.1:4179'));
