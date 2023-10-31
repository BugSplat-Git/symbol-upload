import { tryGetPdbGuid, tryGetPeGuid } from '../src/pdb';

describe('pdb', () => {
    describe('tryGetPdbGuid', () => {
        it('should return guid for c++ pdb', async () => {
            return expectAsync(tryGetPdbGuid('spec/support/bugsplat.pdb')).toBeResolvedTo('E546B55B6D214E86871B40AC35CD0D461');
        });

        it('should return empty guid for unrecognized pdb', () => {
            return expectAsync(tryGetPdbGuid('spec/support/portable.pdb')).toBeResolvedTo('');
        });
    });

    describe('tryGetPeGuid', () => {
        it('should return guid for c++ exe', () => {
            return expectAsync(tryGetPeGuid('spec/support/bssndrpt.exe')).toBeResolvedTo('64FB82D565000');
        });

        it('should return empty guid for unrecognized pe file', () => {
            return expectAsync(tryGetPeGuid('spec/support/corrupt.exe')).toBeResolvedTo('');
        });
    });
});