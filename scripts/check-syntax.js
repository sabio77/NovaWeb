'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function collectJsFiles(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJsFiles(fullPath, output);
    else if (entry.isFile() && entry.name.endsWith('.js')) output.push(fullPath);
  }
  return output;
}

const root = path.resolve(__dirname, '..');
const files = collectJsFiles(root);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
if (failed) process.exit(1);
console.log(`Sintaxis validada en ${files.length} archivo(s) JavaScript.`);
