import type { dumpSyms } from 'node-dump-syms';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAsset, getAssetAsBlob, isSea } from 'node:sea';
import { getDirname, getFilename } from './compat.js';

const nativeModuleDir = join(tmpdir(), 'bugsplat');

export async function importNodeDumpSyms(): Promise<{
  dumpSyms: typeof dumpSyms;
}> {
  if (!isSea()) {
    return import('node-dump-syms');
  }

  if (!existsSync(nativeModuleDir)) {
    await mkdir(nativeModuleDir, { recursive: true });
  }

  const nativeModuleStream = getAssetAsBlob('node-dump-syms.js').stream();
  const targetPath = join(nativeModuleDir, 'node-dump-syms.js');
  await writeFile(targetPath, nativeModuleStream);

  // Node SEA's default require is for embedded modules
  // Use createRequire because it's compatible with loading modules from the file system
  // https://nodejs.org/api/single-executable-applications.html#requireid-in-the-injected-main-script-is-not-file-based
  return createRequire(getFilename())(targetPath);
}

export function findCompressionWorkerPath(): string {
  if (!isSea()) {
    return join(getDirname(), 'compression.js');
  }

  if (!existsSync(nativeModuleDir)) {
    mkdirSync(nativeModuleDir, { recursive: true });
  }

  const nativeModuleStream = getAsset('compression.js');
  const targetPath = join(nativeModuleDir, 'compression.js');
  writeFileSync(targetPath, new Uint8Array(nativeModuleStream));

  return targetPath;
}
