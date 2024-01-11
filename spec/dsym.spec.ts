import { getDSymFileInfos } from '../src/dsym';

describe('dsym', () => {
    describe('getDSymFileInfos', () => {
        it('should return empty dbgId and module name if file is not fat', async () => {
            return expectAsync(getDSymFileInfos('spec/support/bugsplat.pdb')).toBeResolvedTo(jasmine.arrayContaining([{ dbgId: '', moduleName: '' }]));
        });

        it('should return dbgIds, module names and fat true for fat file', () => {
            return expectAsync(getDSymFileInfos('spec/support/bugsplat.app.dSYM')).toBeResolvedTo(jasmine.arrayContaining([
                {
                    dbgId: '2dd1bd2706fa384da5a3a8265921cf9a',
                    moduleName: 'bugsplat.app.dSYM',
                    fat: true
                },
                {
                    dbgId: '2ce192f6c5963e66b06aa22bde5756a0',
                    moduleName: 'bugsplat.app.dSYM',
                    fat: true
                }
            ]));
        });
    });
});