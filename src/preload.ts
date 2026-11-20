import type { dumpSyms } from 'node-dump-syms';
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAsset, getAssetAsBlob, isSea } from 'node:sea';

const nativeModuleDir = join(tmpdir(), 'bugsplat');

/**
 * The error thrown when -m can't load dump_syms. Outside a single-executable build, node-dump-syms
 * is a package dependency whose native module is downloaded by its install script, and Bun, pnpm 10+
 * and `npm --ignore-scripts` skip dependency install scripts: the package is there, its native
 * module isn't. Say so, because "is it installed?" sends people looking in the wrong place.
 */
export function dumpSymsImportError(cause: unknown, sea = isSea()): Error {
    const lines = ["Can't import dump_syms!"];
    if (!sea) {
        lines.push(
            'node-dump-syms downloads its native module in an install script, and some package managers skip',
            'dependency install scripts: Bun and pnpm 10+ by default, and npm with --ignore-scripts.',
            'Let node-dump-syms run its install script, then reinstall it:',
            '  Bun:  "trustedDependencies": ["node-dump-syms"] in package.json',
            '  pnpm: "pnpm": { "onlyBuiltDependencies": ["node-dump-syms"] } in package.json, or pnpm approve-builds',
            '  npm:  install without --ignore-scripts',
        );
    }
    lines.push(
        'https://docs.bugsplat.com/introduction/development/working-with-symbol-files/upload-symbols-with-symbol-upload',
    );
    return new Error(lines.join('\n'), { cause });
}

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
    if (!isSea()) {
        return join(__dirname, 'compression.js');
    }

    if (!existsSync(nativeModuleDir)) {
        mkdirSync(nativeModuleDir, { recursive: true });
    }

    const nativeModuleStream = getAsset('compression.js');
    const targetPath = join(nativeModuleDir, 'compression.js');
    writeFileSync(targetPath, new Uint8Array(nativeModuleStream));

    return targetPath;
}