import { createReadStream, createWriteStream } from 'node:fs';
import { basename } from 'node:path';
import { lstat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import archiver from 'archiver';
import { worker } from 'workerpool';

async function createGzipFile(inputFilePath, outputFilePath) {
    await pipeline(
        createReadStream(inputFilePath),
        createGzip(),
        createWriteStream(outputFilePath)
    );
}

async function createZipFile(inputFilePath, outputFilePath) {
    let output;
    
    try {
        output = createWriteStream(outputFilePath);
        await new Promise(async (resolve, reject) => {
            const zip = archiver('zip');
            
            zip.pipe(output);
            zip.on('error', reject);
            output.on('close', resolve);
            output.on('error', reject);
            
            const isDirectory = await pathIsDirectory(inputFilePath);

            if (isDirectory) {
                zip.directory(inputFilePath, basename(inputFilePath));
            } else {
                zip.file(inputFilePath, { name: basename(inputFilePath) });
            }

            zip.finalize();
        })
    } finally {
        output?.destroy();
    }
}

function pathIsDirectory(path) {
    return lstat(path).then(stat => stat.isDirectory());
}

worker({
    createGzipFile,
    createZipFile
});
