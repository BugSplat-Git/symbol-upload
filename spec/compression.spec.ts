import { ReadStream, createReadStream } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { ReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import { join } from 'node:path';
import workerpool from 'workerpool';
import extract from 'extract-zip';
import { cwd } from 'node:process';
const pool = workerpool.pool(
  join(__dirname, '../src/compression.js')
);

describe('gzip', () => {
  describe('createGzipFile', () => {
    const tmpFileContents = 'hello world';
    const tmpFilePath = 'test.txt';
    const gzipFilePath = 'test.txt.gz';
    beforeEach(async () => {
      await writeFile(tmpFilePath, tmpFileContents);
      await pool.exec('createGzipFile', [tmpFilePath, gzipFilePath]);
    });

    it('should create a gzip file', async () => {
      const stream = ReadStream.toWeb(
        createReadStream(gzipFilePath).pipe(createGunzip())
      );
      const result = await streamToString(stream);
      expect(result).toEqual(tmpFileContents);
    });

    afterEach(async () => {
      await rm(gzipFilePath);
      await rm(tmpFilePath);
    });
  });

  describe('createZipFile', () => {
    const tmpFileContents = 'hello world';
    const tmpFilePath = 'test.txt';
    const zipFilePath = 'test.txt.zip';
    beforeEach(async () => {
      await writeFile(tmpFilePath, tmpFileContents);
      await pool.exec('createZipFile', [tmpFilePath, zipFilePath]);
    });

    it('should create a zip file', async () => {
      const dir = cwd();
      await rm(tmpFilePath);
      await extract(zipFilePath, { dir });
      const stream = ReadStream.toWeb(createReadStream(tmpFilePath));
      const result = await streamToString(stream);
      expect(result).toEqual(tmpFileContents);
    });

    afterEach(async () => {
      await rm(zipFilePath);
      await rm(tmpFilePath);
    });
  });

  describe('createZipFile with an entry name', () => {
    const tmpFileContents = '{}';
    let workDir: string;
    let inputFilePath: string;
    let zipFilePath: string;
    let extractDir: string;

    beforeEach(async () => {
      workDir = await mkdtemp(join(tmpdir(), 'symbol-upload-zip-'));
      inputFilePath = join(workDir, 'linenumbermappings-IOS.json');
      zipFilePath = join(workDir, 'out.zip');
      extractDir = join(workDir, 'extracted');
      await writeFile(inputFilePath, tmpFileContents);
      await pool.exec('createZipFile', [inputFilePath, zipFilePath, 'LineNumberMappings-ios.json']);
    });

    it('should store the file under the entry name', async () => {
      await extract(zipFilePath, { dir: extractDir });
      // readdir returns the stored name, so this checks casing even on case-insensitive file systems
      expect(await readdir(extractDir)).toEqual(['LineNumberMappings-ios.json']);
      const stream = ReadStream.toWeb(createReadStream(join(extractDir, 'LineNumberMappings-ios.json')));
      expect(await streamToString(stream)).toEqual(tmpFileContents);
    });

    afterEach(async () => {
      await rm(workDir, { recursive: true, force: true });
    });
  });
});

async function streamToString(stream: ReadableStream) {
  const chunks = [] as Uint8Array[];

  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf-8');
}
