import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';

const validDebugId = /^[0-9a-f]{32}$/;

// The quoted keys as they appear in a serialized source map. Text inside sourcesContent can't match
// because its quotes are escaped there, so a hit almost always means a real key.
const debugIdKeys = ['"debugId"', '"debug_id"'].map((key) => Buffer.from(key));
const longestDebugIdKey = Math.max(...debugIdKeys.map((key) => key.length));

/**
 * Returns the debug ID in the form symbols are keyed by: lowercase with every hyphen removed.
 * Returns an empty string for anything that isn't 32 hex characters afterwards.
 */
export function normalizeDebugId(debugId: unknown): string {
    if (typeof debugId !== 'string') {
        return '';
    }

    const normalized = debugId.toLowerCase().replace(/-/g, '');
    return validDebugId.test(normalized) ? normalized : '';
}

/**
 * Reads the debug ID from the top level of a source map, preferring debugId over debug_id.
 * Returns the normalized ID, or an empty string if the map has no valid ID or can't be parsed.
 */
export async function tryGetSourceMapDebugId(path: string): Promise<string> {
    try {
        // Bundlers that build maps with magic-string (Rollup, Vite) write debugId as the last key, so
        // reading only the head of the file would miss it. Streaming the whole file for the key is
        // cheap and keeps maps without an ID, which is most of them, from being parsed at all.
        if (!(await containsDebugIdKey(path))) {
            return '';
        }

        const debugId = await parseOneAtATime(() => readTopLevelDebugId(path));
        if (debugId === undefined) {
            return '';
        }

        const normalized = normalizeDebugId(debugId);
        if (!normalized) {
            console.log(`Ignoring invalid debug ID in ${path}: ${JSON.stringify(debugId)}`);
        }

        return normalized;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.log(`Could not get debug ID for ${path}: ${reason}`);
    }

    return '';
}

async function containsDebugIdKey(path: string): Promise<boolean> {
    let window: Buffer = Buffer.alloc(0);

    for await (const chunk of createReadStream(path)) {
        // Carry the end of the previous chunk forward so a key split across two chunks is still found.
        const carried = window.subarray(Math.max(0, window.length - (longestDebugIdKey - 1)));
        window = Buffer.concat([carried, chunk as Buffer]);

        if (debugIdKeys.some((key) => window.includes(key))) {
            return true;
        }
    }

    return false;
}

async function readTopLevelDebugId(path: string): Promise<unknown> {
    const sourceMap = JSON.parse(await readFile(path, 'utf8'));

    if (sourceMap === null || typeof sourceMap !== 'object' || Array.isArray(sourceMap)) {
        return undefined;
    }

    return sourceMap.debugId ?? sourceMap.debug_id ?? undefined;
}

// Source maps can be tens of megabytes and symbol file infos are created for every file at once.
// Parsing a single map at a time bounds memory by the largest map instead of the sum of all of them.
let parsing: Promise<unknown> = Promise.resolve();

function parseOneAtATime<T>(task: () => Promise<T>): Promise<T> {
    const result = parsing.then(task);
    parsing = result.catch(() => undefined);
    return result;
}
