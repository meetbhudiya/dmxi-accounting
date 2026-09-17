// Obfuscates all compiled .js files in dist/ before pkg packaging
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs   = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');

const OBFUSCATOR_OPTIONS = {
  identifierNamesGenerator: 'hexadecimal',
  stringArray: true,
  stringArrayEncoding: ['rc4'],
  stringArrayThreshold: 0.9,
  rotateStringArray: true,
  shuffleStringArray: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  transformObjectKeys: true,
  disableConsoleOutput: false, // keep server logs
  selfDefending: false,        // node.js doesn't need anti-devtools
  compact: true,
  renameGlobals: false,
  renameProperties: false,
};

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.js')) {
      const src = fs.readFileSync(full, 'utf8');
      try {
        const result = JavaScriptObfuscator.obfuscate(src, OBFUSCATOR_OPTIONS);
        fs.writeFileSync(full, result.getObfuscatedCode(), 'utf8');
        console.log(`  obfuscated: ${path.relative(DIST, full)}`);
      } catch (e) {
        // Some generated files (prisma internals) may fail — skip them safely
        console.warn(`  skipped (parse error): ${path.relative(DIST, full)}`);
      }
    }
  }
}

console.log('Obfuscating server dist/ ...');
walk(DIST);
console.log('Done.');
