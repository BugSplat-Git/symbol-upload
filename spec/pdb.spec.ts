import { tryGetPdbGuid, tryGetPeGuid } from '../src/pdb';
import { tryGetPortablePdbGuid } from '../src/portable-pdb';

describe('pdb', () => {
    describe('tryGetPdbGuid', () => {
        it('should return guid for c++ pdb', async () => {
            return expectAsync(tryGetPdbGuid('spec/support/bugsplat.pdb')).toBeResolvedTo('E546B55B6D214E86871B40AC35CD0D461');
        });

        it('should return guid for portable pdb', () => {
            return expectAsync(tryGetPdbGuid('spec/support/portable.pdb')).toBeResolvedTo('153A24FA52FF4C03813A890A535486B8FFFFFFFF');
        });

        it('should return empty guid for missing pdb', () => {
            return expectAsync(tryGetPdbGuid('spec/support/does-not-exist.pdb')).toBeResolvedTo('');
        });
    });

    describe('tryGetPortablePdbGuid', () => {
        it('should return guid + FFFFFFFF age for portable pdb', () => {
            return expectAsync(tryGetPortablePdbGuid('spec/support/portable.pdb')).toBeResolvedTo('153A24FA52FF4C03813A890A535486B8FFFFFFFF');
        });

        it('should reject a native pdb that is not portable', () => {
            return expectAsync(tryGetPortablePdbGuid('spec/support/bugsplat.pdb')).toBeRejected();
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
