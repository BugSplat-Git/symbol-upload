import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getNormalizedSymFileName, getNormalizedSymModuleName, getSymFileInfo, getSymFileNameForDebugFile, nameSymFileAfterDebugFile } from '../src/sym';

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

    describe('getSymFileNameForDebugFile', () => {
        it('should swap .pdb for .sym', () => {
            expect(getSymFileNameForDebugFile('clockwork_desktop.pdb')).toBe('clockwork_desktop.sym');
        });

        it('should keep the dots in the name of a .pdb', () => {
            expect(getSymFileNameForDebugFile('my.app.pdb')).toBe('my.app.sym');
        });

        it('should match the .pdb extension in any case', () => {
            expect(getSymFileNameForDebugFile('BugSplat.PDB')).toBe('BugSplat.sym');
        });

        it('should keep only the file name of a .pdb path', () => {
            expect(getSymFileNameForDebugFile('C:\\build\\..\\my_app.pdb')).toBe('my_app.sym');
            expect(getSymFileNameForDebugFile('../../my_app.pdb')).toBe('my_app.sym');
        });

        it.each([['libc++_shared.so'], ['liba.dylib'], ['Electron Helper (GPU)'], ['.pdb'], ['']])(
            'should return undefined for %s',
            (debugFileName) => {
                expect(getSymFileNameForDebugFile(debugFileName)).toBeUndefined();
            }
        );
    });

    describe('nameSymFileAfterDebugFile', () => {
        let dir: string;

        async function writeSymFile(fileName: string, debugFileName: string): Promise<string> {
            const path = join(dir, fileName);
            await writeFile(path, `MODULE windows x86_64 754D2B50C4E84A3C8F0A0C2D4D0B6F1A1 ${debugFileName}\n`);
            return path;
        }

        beforeEach(async () => {
            dir = join(tmpdir(), `symbol-upload-sym-spec-${randomUUID()}`);
            await mkdir(dir, { recursive: true });
        });

        afterEach(async () => {
            await rm(dir, { recursive: true, force: true });
        });

        // Cargo ships clockwork-desktop.exe with clockwork_desktop.pdb.
        it('should rename a sym file whose debug file is a .pdb with another name', async () => {
            const path = await writeSymFile('clockwork-desktop.sym', 'clockwork_desktop.pdb');

            const renamedPath = await nameSymFileAfterDebugFile(path);

            expect(renamedPath).toBe(join(dir, 'clockwork_desktop.sym'));
            await expect(readdir(dir)).resolves.toEqual(['clockwork_desktop.sym']);
        });

        it('should rename a sym file whose name differs from its .pdb only by case', async () => {
            const path = await writeSymFile('bssndrpt.sym', 'BsSndRpt.pdb');

            const renamedPath = await nameSymFileAfterDebugFile(path);

            expect(renamedPath).toBe(join(dir, 'BsSndRpt.sym'));
            await expect(readdir(dir)).resolves.toEqual(['BsSndRpt.sym']);
        });

        it('should leave a sym file that already has the name of its .pdb', async () => {
            const path = await writeSymFile('windows.sym', 'windows.pdb');

            await expect(nameSymFileAfterDebugFile(path)).resolves.toBe(path);
            await expect(readdir(dir)).resolves.toEqual(['windows.sym']);
        });

        it('should leave a sym file whose debug file is not a .pdb', async () => {
            const path = await writeSymFile('liba.dylib.sym', 'liba.dylib.dSYM');

            await expect(nameSymFileAfterDebugFile(path)).resolves.toBe(path);
            await expect(readdir(dir)).resolves.toEqual(['liba.dylib.sym']);
        });
    });
});
