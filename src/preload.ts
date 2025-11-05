import type { dumpSyms } from 'node-dump-syms';
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export async function importNodeDumpSyms(): Promise<{
    dumpSyms: typeof dumpSyms;
}> {
    return import('node-dump-syms');
}

export function findCompressionWorkerPath(): string {
    // ESM environment: use .mjs worker
    return join(currentDir, 'compression.mjs');
}