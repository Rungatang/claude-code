'use strict';
// The room definition files in load order, and their concatenated source (for the tools' vm sandboxes).
const fs = require('fs');
const path = require('path');
const REGIONS = ['shore', 'rust', 'hours', 'tower', 'archive', 'mills', 'root'];
const FILES = ['js/rooms.js', ...REGIONS.map((r) => `js/rooms/${r}.js`), 'js/zones.js'];
const root = path.resolve(__dirname, '..');
module.exports = {
  REGIONS, FILES,
  source() { return FILES.map((f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/^'use strict';/m, '')).join('\n'); },
};
