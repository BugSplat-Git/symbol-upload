import { getDSymFileInfos } from '../src/dsym';
import { safeRemoveTmp } from '../src/tmp';

describe('dsym', () => {
  describe('getDSymFileInfos', () => {
    it('should return empty array for non-macho file', async () => {
      await expect(
        getDSymFileInfos('spec/support/bugsplat.pdb')
      ).resolves.toEqual(expect.arrayContaining([]));
    });

    it('should return path, dbgIds, module names for macho files', async () => {
      await expect(
        getDSymFileInfos('spec/support/bugsplat.app.dSYM')
      ).resolves.toEqual(
        expect.arrayContaining([
          {
            path: expect.stringMatching(
              /tmp(?:-[0-9a-f]*)*[\/\\]2dd1bd2706fa384da5a3a8265921cf9a[\/\\]BugsplatTester/
            ),
            dbgId: '2dd1bd2706fa384da5a3a8265921cf9a',
            moduleName: 'BugsplatTester',
          },
          {
            path: expect.stringMatching(
              /tmp(?:-[0-9a-f]*)*[\/\\]2ce192f6c5963e66b06aa22bde5756a0[\/\\]BugsplatTester/
            ),
            dbgId: '2ce192f6c5963e66b06aa22bde5756a0',
            moduleName: 'BugsplatTester',
          },
        ])
      );
    });

    afterEach(async () => await safeRemoveTmp());
  });
});
