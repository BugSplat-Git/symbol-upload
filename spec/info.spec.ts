import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSymbolFileInfos, filterSymbolFilePaths, isWasmNameMapFile } from '../src/info';
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

  describe('isWasmNameMapFile', () => {
    it.each(['game.symbols.json', 'Build/game.js.symbols', 'game.symbols', 'GAME.SYMBOLS'])('should match %s', (path) => {
      expect(isWasmNameMapFile(path)).toBe(true);
    });

    it.each(['windows.sym', 'game.json', 'LineNumberMappings-webgl.json', 'game.wasm.map', 'symbols'])('should not match %s', (path) => {
      expect(isWasmNameMapFile(path)).toBe(false);
    });
  });

  describe('createSymbolFileInfos', () => {
    it('should not read an Emscripten .js.symbols map as a Breakpad .sym file', async () => {
      const path = join(tmpDir, 'game.js.symbols');
      await mkdir(tmpDir, { recursive: true });
      await writeFile(path, '0:__wasi_fd_write\n1:main\n');

      try {
        await expect(createSymbolFileInfos(path)).resolves.toEqual([{ path, dbgId: '', moduleName: 'game.js.symbols' }]);
      } finally {
        await safeRemoveTmp();
      }
    });
  });
});
