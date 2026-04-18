import { tryGetGuid } from '../src/guid';

describe('tryGetGuid', () => {
    it('should return guid for c++ pdb', async () => {
        await expect(tryGetGuid('spec/support/bugsplat.pdb')).resolves.toBe('E546B55B6D214E86871B40AC35CD0D461');
    });

    it('should return guid for portable pdb', async () => {
        await expect(tryGetGuid('spec/support/portable.pdb')).resolves.toBe('153A24FA52FF4C03813A890A535486B81');
    });

    it('should return guid for c++ exe', async () => {
        await expect(tryGetGuid('spec/support/bssndrpt.exe')).resolves.toBe('64FB82D565000');
    });

    it('should return empty guid for unrecognized file', async () => {
        await expect(tryGetGuid('spec/support/corrupt.exe')).resolves.toBe('');
    });
});
