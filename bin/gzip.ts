import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

export async function createGzipFile(inputFilePath: string, outputFilePath: string): Promise<void> {
    await pipeline(
        createReadStream(inputFilePath),
        createGzip(),
        createWriteStream(outputFilePath)
    );
}