import { filterSymbolFilePaths } from '../src/info';

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
  });
});
