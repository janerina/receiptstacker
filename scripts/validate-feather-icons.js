/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listFilesRecursive(dir, predicate) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full, predicate));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function extractFeatherNamesFromSource(source) {
  // Captures:
  // <Feather name="..." ...>
  // <Feather name={'...'} ...>
  // <Feather name={"..."} ...>
  const re = /<Feather\b[^>]*\bname\s*=\s*(?:\"([^\"]+)\"|\{\s*'([^']+)'\s*\}|\{\s*\"([^\"]+)\"\s*\})/g;
  const names = [];
  let match;
  while ((match = re.exec(source))) {
    const name = match[1] || match[2] || match[3];
    if (name) names.push(name);
  }
  return names;
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');

  const glyphmapPath = path.join(
    projectRoot,
    'node_modules',
    'react-native-vector-icons',
    'glyphmaps',
    'Feather.json',
  );

  if (!fs.existsSync(glyphmapPath)) {
    console.error(`Feather glyphmap not found at: ${glyphmapPath}`);
    process.exit(2);
  }

  const glyphmap = readJson(glyphmapPath);
  const valid = new Set(Object.keys(glyphmap));

  const srcDir = path.join(projectRoot, 'src');
  const files = listFilesRecursive(srcDir, (f) => f.endsWith('.ts') || f.endsWith('.tsx'));

  const invalidByFile = new Map();

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const used = extractFeatherNamesFromSource(source);
    if (!used.length) continue;

    const invalid = Array.from(new Set(used.filter((n) => !valid.has(n)))).sort();
    if (invalid.length) invalidByFile.set(path.relative(projectRoot, file), invalid);
  }

  if (invalidByFile.size) {
    console.error('Invalid Feather icon names found:');
    for (const [file, names] of invalidByFile.entries()) {
      console.error(`- ${file}: ${names.join(', ')}`);
    }
    process.exit(1);
  }

  console.log('OK: All Feather icon names are valid.');
}

main();
