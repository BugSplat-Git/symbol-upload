import archiver from "archiver";
import { createWriteStream } from "fs";
import { pathIsDirectory } from "./util";
import { basename } from "path";

export async function createZipFile(inputFilePaths: Array<string>, outputFilePath: string): Promise<void> {
    const zip = new Zip();
    
    for (const inputFilePath of inputFilePaths) {
        await zip.addEntry(inputFilePath);
    }
    
    await zip.write(outputFilePath);
}

export class Zip {
    constructor(private readonly entries: Array<ZipEntry> = []) { }

    addFile(path: string) {
        this.entries.push({
            path,
            isDirectory: false
        });
    }

    addDirectory(path: string) {
        this.entries.push({
            path,
            isDirectory: true
        });
    }

    async addEntry(path: string) {
        const isDirectory = await pathIsDirectory(path);
        this.entries.push({
            path,
            isDirectory
        });
    }

    getEntries(): Array<ZipEntry> {
        return this.entries;
    }

    async write(path: string): Promise<void> {
        const output = createWriteStream(path);
        
        try {
            await new Promise<void>((resolve, reject) => {
                const zip = archiver('zip');
                
                zip.pipe(output);
                zip.on('error', reject);
                output.on('close', resolve);
                output.on('error', reject);
                
                const files = this.entries.filter(entry => !entry.isDirectory);
                const directories = this.entries.filter(entry => entry.isDirectory);
                files.forEach(file => zip.file(file.path, { name: basename(file.path) }));
                directories.forEach(directory => zip.directory(directory.path, basename(directory.path)));
    
                zip.finalize();
            })
        } finally {
            output.close();
        }
    }
}

export interface ZipEntry {
    path: string;
    isDirectory: boolean;
}