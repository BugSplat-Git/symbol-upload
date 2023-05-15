import { Zip } from '../bin/zip';

describe('Zip', () => {
    describe('addFile', () => {
        it('should add a file to the zip', () => {
            const file = 'file.txt';

            const zip = new Zip();
            zip.addFile(file);
            const entries = zip.getEntries();

            expect(entries[0].isDirectory).toBe(false);
            expect(entries[0].path).toBe(file);
        });
    });

    describe('addDirectory', () => {
        it('should add a folder to the zip', () => {
            const folder = 'folder';

            const zip = new Zip();
            zip.addDirectory(folder);
            const entries = zip.getEntries();

            expect(entries[0].isDirectory).toBe(true);
            expect(entries[0].path).toBe(folder);
        });
    });

    describe('addEntry', () => {
        it('should add file to zip if path is a file', async () => {
            const file = __filename;

            const zip = new Zip();
            await zip.addEntry(file);
            const entries = zip.getEntries();

            expect(entries[0].isDirectory).toBe(false);
            expect(entries[0].path).toBe(file);
        });

        it('should add folder to zip if path is a folder', async () => {
            const folder = __dirname;

            const zip = new Zip();
            await zip.addEntry(folder);
            const entries = zip.getEntries();

            expect(entries[0].isDirectory).toBe(true);
            expect(entries[0].path).toBe(folder);
        });
    });
});