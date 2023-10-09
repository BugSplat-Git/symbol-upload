import { ReadStream, createReadStream } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { ReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import { createGzipFile } from '../bin/gzip';

describe('gzip', () => {

    describe('createGzipFile', () => {
        const tmpFileContents = 'hello world'
        const tmpFilePath = 'test.txt';
        const gzipFilePath = 'test.txt.gz';
        beforeEach(async () => {
            await writeFile(tmpFilePath, tmpFileContents);
            await createGzipFile(tmpFilePath, gzipFilePath);
        });

        it('should create a gzip file', async () => {
            const stream = ReadStream.toWeb(createReadStream(gzipFilePath).pipe(createGunzip()));
            const result = await streamToString(stream);
            expect(result).toEqual(tmpFileContents);
        });

        afterEach(async () => {
            await rm(gzipFilePath);
            await rm(tmpFilePath);
        });
    });
});

async function streamToString(stream: ReadableStream) {
    const chunks = [] as Uint8Array[];

    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks).toString("utf-8");
}
