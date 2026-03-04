import type { dumpSyms } from 'node-dump-syms';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const compiledWorkerDir = join(tmpdir(), 'bugsplat');

export async function importNodeDumpSyms(): Promise<{
    dumpSyms: typeof dumpSyms;
}> {
    return import('node-dump-syms');
}

export function findCompressionWorkerPath(): string {
    // In compiled mode, the worker bundle is embedded via bin/compile-entry.ts.
    // Check this first because __dirname may resolve to the original source
    // directory where compression.js exists as an unbundled file.
    const embeddedPath: string | undefined = (globalThis as any).__embeddedWorkerPath;

    if (embeddedPath) {
        if (!existsSync(compiledWorkerDir)) {
            mkdirSync(compiledWorkerDir, { recursive: true });
        }

        const targetPath = join(compiledWorkerDir, 'compression.bundle.js');

        if (!existsSync(targetPath)) {
            // In Bun compiled binaries, embedded assets live in /$bunfs/ virtual filesystem.
            // Node's copyFileSync can't read from /$bunfs/, but readFileSync works.
            const content = readFileSync(embeddedPath);
            writeFileSync(targetPath, content);
        }

        return targetPath;
    }

    const devPath = join(__dirname, 'compression.js');

    if (existsSync(devPath)) {
        return devPath;
    }

    throw new Error('Could not find compression worker');
}
