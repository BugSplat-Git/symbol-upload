import { getSymFileInfo } from '../src/sym';

describe('getSymFileInfo', () => {
    it('should get debug id for file with a 33 character debug id', async () => {
        const expected = '83AE77A7796BDF7DCE8CE3564B3B5D650';

        const { dbgId } = await getSymFileInfo('./spec/support/android.sym');

        expect(dbgId).toBe(expected);
    });

    it('should get debug id for file with a 34 character debug id', async () => {
        const expected = '9DD7CE5C705C45B09BEE297B84B5B9881c';

        const { dbgId } = await getSymFileInfo('./spec/support/windows.sym');

        expect(dbgId).toBe(expected);
    });

    it('should get module name for file with line feeds', async () => {
        const expected = 'libc++_shared.so';

        const { moduleName } = await getSymFileInfo('./spec/support/android.sym');

        expect(moduleName).toBe(expected);
    });

    it('should get module name for file with spaces in module name', async () => {
        const expected = 'Electron Helper (GPU)';

        const { moduleName } = await getSymFileInfo('./spec/support/spaces.sym');

        expect(moduleName).toBe(expected);
    });

    it('should get module name for file with line feeds and carriage returns', async () => {
        const expected = 'windows.pdb';

        const { moduleName } = await getSymFileInfo('./spec/support/windows.sym');

        expect(moduleName).toBe(expected);
    });
});