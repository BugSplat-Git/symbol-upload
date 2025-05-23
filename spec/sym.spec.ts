import { getNormalizedSymFileName, getNormalizedSymModuleName, getSymFileInfo } from '../src/sym';

describe('sym', () => {
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

        it('should get module name for file with .dylib.dSYM extension', async () => {
            const expected = 'liba.dylib';

            const { moduleName } = await getSymFileInfo('./spec/support/liba.dylib.sym');

            expect(moduleName).toBe(expected);
        });
    });

    describe('getNormalizedSymModuleName', () => {
        it('should get normalized sym module name for file with .dylib.dSYM extension', () => {
            const expected = 'liba.dylib';

            const normalizedSymModuleName = getNormalizedSymModuleName('liba.dylib.dSYM');

            expect(normalizedSymModuleName).toBe(expected);
        });

        it('should get normalized sym module name for file with .app.dSYM extension', () => {
            const expected = 'Electron';

            const normalizedSymModuleName = getNormalizedSymModuleName('Electron.app.dSYM');

            expect(normalizedSymModuleName).toBe(expected);
        });

        it('should get normalized sym module name for file with .so extension', () => {
            const expected = 'liba.so';

            const normalizedSymModuleName = getNormalizedSymModuleName('liba.so');

            expect(normalizedSymModuleName).toBe(expected);
        });

        it('should get normalized sym module name for file with .so.0 extension', () => {
            const expected = 'liba.so.0';

            const normalizedSymModuleName = getNormalizedSymModuleName('liba.so.0');

            expect(normalizedSymModuleName).toBe(expected);
        });
        
        it('should get normalized sym file name for file with a .pdb extension', () => {
            const expected = 'windows.pdb';

            const normalizedSymModuleName = getNormalizedSymModuleName('windows.pdb');

            expect(normalizedSymModuleName).toBe(expected);
        });

        it('should get normalized sym module name for file with a .so.2.debug extension', () => {
            const expected = 'linux.so.2';

            const normalizedSymModuleName = getNormalizedSymModuleName('linux.so.2.debug');

            expect(normalizedSymModuleName).toBe(expected);
        });

        it('should get normalized sym module name for file with a .debug extension', () => {
            const expected = 'linux';

            const normalizedSymModuleName = getNormalizedSymModuleName('linux.debug');

            expect(normalizedSymModuleName).toBe(expected);
        });
    });

    describe('getNormalizedSymFileName', () => {
        it('should get normalized sym file name for file with .dylib.dSYM extension', () => {
            const expected = 'liba.dylib.sym';

            const normalizedSymFileName = getNormalizedSymFileName('liba.dylib.dSYM');

            expect(normalizedSymFileName).toBe(expected);
        });

        it('should get normalized sym file name for file with .app.dSYM extension', () => {
            const expected = 'Electron.sym';

            const normalizedSymFileName = getNormalizedSymFileName('Electron.app.dSYM');

            expect(normalizedSymFileName).toBe(expected);
        });

        it('should get normalized sym file name for file with .so extension', () => {
            const expected = 'liba.so.sym';

            const normalizedSymFileName = getNormalizedSymFileName('liba.so');

            expect(normalizedSymFileName).toBe(expected);
        });

        it('should get normalized sym file name for file with .so.0 extension', () => {
            const expected = 'liba.so.0.sym';

            const normalizedSymFileName = getNormalizedSymFileName('liba.so.0');

            expect(normalizedSymFileName).toBe(expected);
        });
        
        it('should get normalized sym file name for file with a .pdb extension', () => {
            const expected = 'windows.sym';

            const normalizedSymFileName = getNormalizedSymFileName('windows.pdb');

            expect(normalizedSymFileName).toBe(expected);
        });

        it('should get normalized sym file name for file with a .so.2.debug extension', () => {
            const expected = 'linux.so.2.sym';

            const normalizedSymFileName = getNormalizedSymFileName('linux.so.2.debug');

            expect(normalizedSymFileName).toBe(expected);
        });

        it('should get normalized sym file name for file with a .debug extension', () => {
            const expected = 'linux.sym';

            const normalizedSymFileName = getNormalizedSymFileName('linux.debug');

            expect(normalizedSymFileName).toBe(expected);
        });
    });
});