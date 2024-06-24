import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAsset, getAssetAsBlob, isSea } from 'node:sea';
import type { dumpSyms } from 'node-dump-syms';
import { createRequire } from "node:module";

export async function importNodeDumpSyms(): Promise<{
    dumpSyms: typeof dumpSyms;
}> {
    if (!isSea()) {
        return import('node-dump-syms');
    }

    const nativeModuleDir = join(tmpdir(), 'bugsplat');
    if (!existsSync(nativeModuleDir)) {
        await mkdir(nativeModuleDir, { recursive: true });
    }

    const nativeModuleStream = getAssetAsBlob('node-dump-syms.js').stream();
    const targetPath = join(nativeModuleDir, 'node-dump-syms.js');
    await writeFile(targetPath, nativeModuleStream);

    // Node SEA's default require is for embedded modules
    // Use createRequire because it's compatible with loading modules from the file system
    // https://nodejs.org/api/single-executable-applications.html#requireid-in-the-injected-main-script-is-not-file-based
    return createRequire(__filename)(targetPath);
};

export function findCompressionWorkerPath(): string {
    if (!isSea()) {
        return join(__dirname, 'compression.js');
    }

    const nativeModuleDir = join(tmpdir(), 'bugsplat');
    if (!existsSync(nativeModuleDir)) {
        mkdirSync(nativeModuleDir, { recursive: true });
    }

    const nativeModuleStream = getAsset('compression.js');
    const targetPath = join(nativeModuleDir, 'compression.js');
    writeFileSync(targetPath, Buffer.from((nativeModuleStream)));

    return targetPath;
}