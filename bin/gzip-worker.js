const { parentPort, workerData } = require('worker_threads');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const { createGzip } = require('zlib');

async function createGzipFile(inputFilePath, outputFilePath) {
    await pipeline(
        createReadStream(inputFilePath),
        createGzip(),
        createWriteStream(outputFilePath)
    );
}

createGzipFile(workerData.inputFilePath, workerData.outputFilePath)
    .then(() => parentPort.postMessage({ type: 'done' }))
    .catch((error) => parentPort.postMessage({ type: 'error', error }));