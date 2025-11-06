import { tryGetPdbGuid, tryGetPeGuid } from '../src/pdb';

describe('pdb', () => {
    describe('tryGetPdbGuid', () => {
        it('should return guid for c++ pdb', async () => {
            await expect(tryGetPdbGuid('spec/support/bugsplat.pdb')).resolves.toBe('E546B55B6D214E86871B40AC35CD0D461');
        });

        it('should return empty guid for unrecognized pdb', async () => {
            await expect(tryGetPdbGuid('spec/support/portable.pdb')).resolves.toBe('');
        });
    });

    describe('tryGetPeGuid', () => {
        it('should return guid for c++ exe', async () => {
            await expect(tryGetPeGuid('spec/support/bssndrpt.exe')).resolves.toBe('64FB82D565000');
        });

        it('should return empty guid for unrecognized pe file', async () => {
            await expect(tryGetPeGuid('spec/support/corrupt.exe')).resolves.toBe('');
        });
    });
});