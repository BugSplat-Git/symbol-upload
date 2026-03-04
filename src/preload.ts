import type { dumpSyms } from 'node-dump-syms';
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const compiledWorkerDir = join(tmpdir(), 'bugsplat');

export async function importNodeDumpSyms(): Promise<{
    dumpSyms: typeof dumpSyms;
}> {
    return import('node-dump-syms');
}

export function findCompressionWorkerPath(): string {
    const devPath = join(__dirname, 'compression.js');

    if (existsSync(devPath)) {
        return devPath;
    }

    // In compiled mode, the worker bundle is embedded via bin/compile-entry.ts
    const embeddedPath: string | undefined = (globalThis as any).__embeddedWorkerPath;

    if (!embeddedPath) {
        throw new Error('Could not find compression worker');
    }

    if (!existsSync(compiledWorkerDir)) {
        mkdirSync(compiledWorkerDir, { recursive: true });
    }

    const targetPath = join(compiledWorkerDir, 'compression.bundle.js');

    if (!existsSync(targetPath)) {
        copyFileSync(embeddedPath, targetPath);
    }

    return targetPath;
}
