

const { createReadStream, createWriteStream } = require('node:fs');
const { basename } = require('node:path');
const { lstat } = require('node:fs/promises');
const { pipeline } = require('node:stream/promises');
const { createGzip } = require('node:zlib');
const archiver = require('archiver');
const workerpool = require('workerpool');

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

workerpool.worker({
    createGzipFile,
    createZipFile
});
