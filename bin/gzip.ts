import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

const workerScriptPath = join(__dirname, 'gzip-worker.js');

export async function createGzipFile(inputFilePath: string, outputFilePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerScriptPath, {
            workerData: { inputFilePath, outputFilePath }
        });

        worker.on('message', (message) => {
            if (message.type === 'error') {
                reject(message.error);
            } else if (message.type === 'done') {
                resolve();
            }
        });

        worker.on('error', (error) => {
            reject(error);
        });
    });
}