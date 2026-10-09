// Fails the build when a script file in dist/assets is over the size limit, so a growing bundle
// is noticed in the pull request instead of when it is already close to the limit.
// Sizes are minified, before gzip, in kB of 1000 bytes (the same numbers Vite prints).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/** Per-file limit; keep in sync with `chunkSizeWarningLimit` in vite.config.ts. */
const LIMIT_KB = 800;
/** Above this share of the limit a file gets a warning, so there is time to split it. */
const WARN_SHARE = 0.85;

const dir = join(import.meta.dirname, '..', 'dist', 'assets');
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({ name, kb: statSync(join(dir, name)).size / 1000 }))
  .sort((a, b) => b.kb - a.kb);

let failed = false;
for (const { name, kb } of files) {
  const mark = kb > LIMIT_KB ? 'TOO BIG' : kb > LIMIT_KB * WARN_SHARE ? 'warning' : 'ok';
  if (kb > LIMIT_KB) failed = true;
  console.log(`${mark.padEnd(8)} ${kb.toFixed(1).padStart(8)} kB  ${name}`);
}
const total = files.reduce((sum, file) => sum + file.kb, 0);
console.log(`total    ${total.toFixed(1).padStart(8)} kB  (limit ${LIMIT_KB} kB per file)`);
if (failed) {
  console.error(
    `A script file is over ${LIMIT_KB} kB: split it (see codeSplitting in vite.config.ts).`,
  );
  process.exit(1);
}
