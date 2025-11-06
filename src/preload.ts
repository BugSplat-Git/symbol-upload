import type { dumpSyms } from 'node-dump-syms';
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAsset, getAssetAsBlob, isSea } from 'node:sea';
import { getCurrentFileInfo } from './compat.js';

// @ts-ignore - Get current file info with ESM/CommonJS compatibility
const { __filename, __dirname } = getCurrentFileInfo(import.meta?.url); 

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
    return createRequire(__filename)(targetPath);
};

export function findCompressionWorkerPath(): string {
    // Non-SEA environment: choose based on module system
    // In ESM environments (like development with tsx), use .mjs
    // In CJS environments, use .js
    if (!isSea()) {
        // @ts-ignore - Check if we're in an ESM environment
        const isESM = typeof import.meta?.url === 'string';
        const workerFile = isESM ? 'compression.mjs' : 'compression.cjs';
        return join(__dirname, workerFile);
    }

    // SEA environment: always use CommonJS version
    if (!existsSync(nativeModuleDir)) {
        mkdirSync(nativeModuleDir, { recursive: true });
    }

    const nativeModuleStream = getAsset('compression.js');
    const targetPath = join(nativeModuleDir, 'compression.js');
    writeFileSync(targetPath, new Uint8Array(nativeModuleStream));

    return targetPath;
}