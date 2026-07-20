const ncc = require('@vercel/ncc');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

// archiver v8 is ESM-only, which bpkg can't bundle; ncc inlines it into a single CJS worker file.
const input = resolve(__dirname, '..', 'src', 'compression.js');
const outDir = resolve(__dirname, '..', 'dist');
const outFile = join(outDir, 'compression.js');

ncc(input, { minify: false, sourceMap: false })
  .then(({ code }) => {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(outFile, code);
    console.log(`Bundled compression worker -> ${outFile}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
