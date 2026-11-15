import type { ReadStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';

// Counts the files source-map.ts has open for scanning, so a spec can tell how many it opens at once.
const scans = vi.hoisted(() => ({ open: [] as ReadStream[], mostOpen: 0 }));

vi.mock('node:fs', async (importOriginal) => {
    const fs = await importOriginal<typeof import('node:fs')>();
    const createReadStream = (...args: Parameters<typeof fs.createReadStream>) => {
        const stream = fs.createReadStream(...args);
        scans.open = [...scans.open.filter((open) => !open.destroyed), stream];
        scans.mostOpen = Math.max(scans.mostOpen, scans.open.length);
        return stream;
    };

    return { ...fs, createReadStream };
});

import { normalizeDebugId, tryGetSourceMapDebugId } from '../src/source-map';

const debugId = '9f2c1a7e-3b4d-4c5e-8f60-112233445566';
const normalizedDebugId = '9f2c1a7e3b4d4c5e8f60112233445566';

describe('source-map', () => {
    describe('normalizeDebugId', () => {
        it('should remove hyphens', () => {
            expect(normalizeDebugId(debugId)).toBe(normalizedDebugId);
        });

        it('should lowercase', () => {
            expect(normalizeDebugId(debugId.toUpperCase())).toBe(normalizedDebugId);
        });

        it('should keep an ID that is already normalized', () => {
            expect(normalizeDebugId(normalizedDebugId)).toBe(normalizedDebugId);
        });

        it.each([
            ['an empty string', ''],
            ['too few characters', normalizedDebugId.slice(1)],
            ['too many characters', `${normalizedDebugId}0`],
            ['a character that is not hex', `g${normalizedDebugId.slice(1)}`],
            ['braces', `{${debugId}}`],
            ['surrounding whitespace', ` ${debugId} `],
            ['a number', 12345678901234567890123456789012],
            ['null', null],
            ['undefined', undefined],
            ['an object', { debugId }],
        ])('should return an empty string for %s', (_, value) => {
            expect(normalizeDebugId(value)).toBe('');
        });
    });

    describe('tryGetSourceMapDebugId', () => {
        let directory: string;
        let log: ReturnType<typeof vi.spyOn>;

        beforeAll(async () => {
            directory = await mkdtemp(join(tmpdir(), 'symbol-upload-source-map-spec-'));
        });

        beforeEach(() => {
            log = vi.spyOn(console, 'log').mockImplementation(() => {});
        });

        afterEach(() => log.mockRestore());

        afterAll(async () => await rm(directory, { recursive: true, force: true }));

        async function writeMap(name: string, contents: unknown): Promise<string> {
            const path = join(directory, name);
            await writeFile(path, typeof contents === 'string' ? contents : JSON.stringify(contents));
            return path;
        }

        it('should read a top-level debugId', async () => {
            const path = await writeMap('debugId.js.map', { version: 3, debugId, mappings: 'AAAA' });

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe(normalizedDebugId);
        });

        it('should fall back to a top-level debug_id', async () => {
            const path = await writeMap('debug_id.js.map', { version: 3, mappings: 'AAAA', debug_id: debugId });

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe(normalizedDebugId);
        });

        it('should prefer debugId over debug_id', async () => {
            const path = await writeMap('both.js.map', {
                version: 3,
                debug_id: '00000000-0000-0000-0000-000000000000',
                debugId,
            });

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe(normalizedDebugId);
        });

        it('should normalize an uppercase debugId', async () => {
            const path = await writeMap('uppercase.js.map', { version: 3, debugId: debugId.toUpperCase() });

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe(normalizedDebugId);
        });

        // magic-string, which Rollup and Vite build their maps with, writes debugId as the last key.
        it('should read a debugId written at the end of a large map', async () => {
            const path = await writeMap('large.js.map', {
                version: 3,
                file: 'large.js',
                sources: ['large.ts'],
                sourcesContent: ['x'.repeat(8 * 1024 * 1024)],
                names: [],
                mappings: 'AAAA;'.repeat(2 * 1024 * 1024),
                debugId,
            });

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe(normalizedDebugId);
        });

        // Files are read in 64 KiB chunks, so place the key across the first chunk boundary.
        it.each([1, 4, 8])('should read a debugId whose key is split %i bytes before a chunk boundary', async (offset) => {
            const head = '{"version":3,"mappings":"';
            const tail = `","debugId":"${debugId}"}`;
            const keyStart = 64 * 1024 - offset;
            const padding = 'A'.repeat(keyStart - head.length - '",'.length);
            const contents = `${head}${padding}${tail}`;
            const path = await writeMap(`split-${offset}.js.map`, contents);

            expect(contents.indexOf('"debugId"')).toBe(keyStart);
            await expect(tryGetSourceMapDebugId(path)).resolves.toBe(normalizedDebugId);
        });

        it('should return an empty string for a map without a debug ID', async () => {
            const path = await writeMap('none.js.map', { version: 3, sources: ['a.ts'], mappings: 'AAAA' });

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe('');
            expect(log).not.toHaveBeenCalled();
        });

        it('should ignore a debugId that is not at the top level', async () => {
            const path = await writeMap('nested.js.map', {
                version: 3,
                sections: [{ offset: { line: 0, column: 0 }, map: { version: 3, debugId } }],
            });

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe('');
        });

        it('should ignore a debugId that only appears in source text', async () => {
            const path = await writeMap('source-text.js.map', {
                version: 3,
                sourcesContent: [`const map = {"debugId":"${debugId}"};`],
                mappings: 'AAAA',
            });

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe('');
        });

        it.each([
            ['is not a UUID', 'not-a-debug-id'],
            ['is too short', debugId.slice(1)],
            ['is an empty string', ''],
            ['is a number', 42],
            ['is an object', { id: debugId }],
        ])('should return an empty string and say why when debugId %s', async (_, value) => {
            const path = await writeMap('invalid.js.map', { version: 3, debugId: value });

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe('');
            expect(log).toHaveBeenCalledWith(expect.stringContaining(`Ignoring invalid debug ID in ${path}`));
        });

        it('should not fall back to debug_id when debugId is present but invalid', async () => {
            const path = await writeMap('invalid-with-fallback.js.map', {
                version: 3,
                debugId: 'not-a-debug-id',
                debug_id: debugId,
            });

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe('');
        });

        it('should return an empty string for malformed JSON', async () => {
            const path = await writeMap('truncated.js.map', `{"version":3,"debugId":"${debugId}","mappings":"AAAA`);

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe('');
            expect(log).toHaveBeenCalledWith(expect.stringContaining(`Could not get debug ID for ${path}`));
        });

        it.each([
            ['an array', `[{"debugId":"${debugId}"}]`],
            ['a string', JSON.stringify(`"debugId":"${debugId}"`)],
            ['null with a trailing key', `null "debugId"`],
        ])('should return an empty string when the file is %s', async (_, contents) => {
            const path = await writeMap('not-an-object.js.map', contents);

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe('');
        });

        it('should return an empty string for an empty file', async () => {
            const path = await writeMap('empty.js.map', '');

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe('');
        });

        it('should return an empty string for a file that does not exist', async () => {
            const path = join(directory, 'does-not-exist.js.map');

            await expect(tryGetSourceMapDebugId(path)).resolves.toBe('');
            expect(log).toHaveBeenCalledWith(expect.stringContaining(`Could not get debug ID for ${path}`));
        });

        it('should read many maps at once, including after one fails to parse', async () => {
            const ids = Array.from({ length: 20 }, (_, i) => `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`);
            const paths = await Promise.all(ids.map((id, i) => writeMap(`many-${i}.js.map`, { version: 3, debugId: id })));
            const malformed = await writeMap('many-malformed.js.map', `{"debugId":"${debugId}"`);

            const results = await Promise.all([malformed, ...paths].map((path) => tryGetSourceMapDebugId(path)));

            expect(results).toEqual(['', ...ids.map((id) => id.replace(/-/g, ''))]);
        });

        // Symbol file infos are created for every file at once. Opening every map at once runs a big
        // build out of file descriptors (EMFILE), and a map that can't be read is uploaded without its ID.
        it('should have one map open at a time when many are read at once', async () => {
            const ids = Array.from({ length: 50 }, (_, i) => `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`);
            const paths = await Promise.all(ids.map((id, i) => writeMap(`open-${i}.js.map`, { version: 3, debugId: id })));
            const without = await writeMap('open-without.js.map', { version: 3, mappings: 'AAAA' });
            scans.mostOpen = 0;

            const results = await Promise.all([without, ...paths].map((path) => tryGetSourceMapDebugId(path)));

            expect(results).toEqual(['', ...ids.map((id) => id.replace(/-/g, ''))]);
            expect(scans.mostOpen).toBe(1);
        });
    });
});
