#!/usr/bin/env node
// data/data.json  →  data/data.js  (browser-loadable wrapper).
// The dashboard reads data.js; data.json is the canonical store the feeders edit.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data');
const json = fs.readFileSync(path.join(dir, 'data.json'), 'utf8');
fs.writeFileSync(path.join(dir, 'data.js'),
  `// AUTO-GENERATED from data.json by scripts/wrap.js. Do not edit by hand.\nwindow.TRACKER_DATA = ${json};\n`);
