import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSymbolFileInfos, filterSymbolFilePaths } from '../src/info';
import { safeRemoveTmp, tmpDir } from '../src/tmp';

describe('info', () => {
  describe('filterSymbolFilePaths', () => {
    it('should drop directories', async () => {
      await expect(
        filterSymbolFilePaths([
          'spec/support',
          'spec/support/bugsplat.xcarchive',
          'spec/support/dir with spaces',
          'spec/support/windows.sym',
        ])
      ).resolves.toEqual(['spec/support/windows.sym']);
    });

    it('should keep dSYM bundles', async () => {
      await expect(
        filterSymbolFilePaths([
          'spec/support/bugsplat.app.dSYM',
          'spec/support/libggcurl.dylib.dSYM',
        ])
      ).resolves.toEqual([
        'spec/support/bugsplat.app.dSYM',
        'spec/support/libggcurl.dylib.dSYM',
      ]);
    });

    it('should keep files and preserve order', async () => {
      const paths = [
        'spec/support/windows.sym',
        'spec/support/bugsplat.pdb',
        'spec/support/bugsplat.elf',
      ];
      await expect(filterSymbolFilePaths(paths)).resolves.toEqual(paths);
    });

    it('should drop directories whose extension merely starts with .dsym', async () => {
      const notABundle = join(tmpDir, 'weird.dsym2');
      await mkdir(notABundle, { recursive: true });

      try {
        await expect(filterSymbolFilePaths([notABundle])).resolves.toEqual([]);
      } finally {
        await safeRemoveTmp();
      }
    });

    it('should surface stat errors instead of deferring them', async () => {
      await expect(
        filterSymbolFilePaths(['spec/support/does-not-exist.sym'])
      ).rejects.toThrow('ENOENT');
    });
  });

  describe('createSymbolFileInfos', () => {
    describe('source maps', () => {
      const debugId = '9F2C1A7E-3B4D-4C5E-8F60-112233445566';
      const normalizedDebugId = '9f2c1a7e3b4d4c5e8f60112233445566';
      let directory: string;

      beforeAll(async () => {
        directory = await mkdtemp(join(tmpdir(), 'symbol-upload-info-spec-'));
      });

      afterAll(async () => await rm(directory, { recursive: true, force: true }));

      it('should use the normalized debugId as dbgId and the file name as moduleName', async () => {
        const path = join(directory, 'index-BX3k2a9f.js.map');
        await writeFile(path, JSON.stringify({ version: 3, file: 'index.js', mappings: 'AAAA', debugId }));

        await expect(createSymbolFileInfos(path)).resolves.toEqual([
          { path, dbgId: normalizedDebugId, moduleName: 'index-BX3k2a9f.js.map' },
        ]);
      });

      it('should fall back to debug_id', async () => {
        const path = join(directory, 'debug_id.js.map');
        await writeFile(path, JSON.stringify({ version: 3, mappings: 'AAAA', debug_id: debugId }));

        await expect(createSymbolFileInfos(path)).resolves.toEqual([
          { path, dbgId: normalizedDebugId, moduleName: 'debug_id.js.map' },
        ]);
      });

      it('should match the extension without regard to case', async () => {
        const path = join(directory, 'UPPER.JS.MAP');
        await writeFile(path, JSON.stringify({ version: 3, debugId }));

        await expect(createSymbolFileInfos(path)).resolves.toEqual([
          { path, dbgId: normalizedDebugId, moduleName: 'UPPER.JS.MAP' },
        ]);
      });

      it('should leave dbgId empty when the map has no debug ID', async () => {
        const path = join(directory, 'none.js.map');
        await writeFile(path, JSON.stringify({ version: 3, mappings: 'AAAA' }));

        await expect(createSymbolFileInfos(path)).resolves.toEqual([
          { path, dbgId: '', moduleName: 'none.js.map' },
        ]);
      });

      it('should leave dbgId empty when the debug ID is not valid', async () => {
        const path = join(directory, 'invalid.js.map');
        await writeFile(path, JSON.stringify({ version: 3, debugId: 'not-a-debug-id' }));

        await expect(createSymbolFileInfos(path)).resolves.toEqual([
          { path, dbgId: '', moduleName: 'invalid.js.map' },
        ]);
      });

      it('should leave dbgId empty when the map is not valid JSON', async () => {
        const path = join(directory, 'malformed.js.map');
        await writeFile(path, `{"version":3,"debugId":"${debugId}"`);

        await expect(createSymbolFileInfos(path)).resolves.toEqual([
          { path, dbgId: '', moduleName: 'malformed.js.map' },
        ]);
      });

      it('should not read a debug ID from a file that is not a source map', async () => {
        const path = join(directory, 'manifest.json');
        await writeFile(path, JSON.stringify({ debugId }));

        await expect(createSymbolFileInfos(path)).resolves.toEqual([
          { path, dbgId: '', moduleName: 'manifest.json' },
        ]);
      });

      it('should not read a debug ID from a directory named like a source map', async () => {
        const path = join(directory, 'folder.js.map');
        await mkdir(path);

        await expect(createSymbolFileInfos(path)).resolves.toEqual([
          { path, dbgId: '', moduleName: 'folder.js.map' },
        ]);
      });
    });
  });
});
