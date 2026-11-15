import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { availableParallelism, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { vi } from 'vitest';
import * as api from '../index';
import * as info from '../src/info';
import { SymbolFileInfo } from '../src/info';
import { tmpDir } from '../src/tmp';
import { uploadSymbols, UploadSymbolsOptions } from '../src/upload-symbols';

const debugId = '9F2C1A7E-3B4D-4C5E-8F60-112233445566';
const dbgId = '9f2c1a7e3b4d4c5e8f60112233445566';
const mapWithDebugId = JSON.stringify({ version: 3, file: 'index-BX3k2a9f.js', sources: ['index.ts'], mappings: 'AAAA', debugId });
const mapWithoutDebugId = JSON.stringify({ version: 3, file: 'legacy.js', sources: ['legacy.ts'], mappings: 'AAAA' });

type RecordedRequest = {
    method: string;
    path: string;
    headers: IncomingHttpHeaders;
    fields: Record<string, string>;
    body: Buffer;
};

describe('uploadSymbols', () => {
    let server: Server;
    let host: string;
    let requests: RecordedRequest[];
    let refuseNextUploadUrl: boolean;
    let root: string;
    let directory: string;
    let options: UploadSymbolsOptions;

    beforeAll(async () => {
        // Stands in for BugSplat: hands out a token, then a presigned URL on itself for every file.
        server = createServer(async (request, response) => {
            const chunks: Buffer[] = [];
            for await (const chunk of request) {
                chunks.push(chunk);
            }

            const body = Buffer.concat(chunks);
            const method = request.method ?? '';
            const path = new URL(request.url ?? '/', host).pathname;
            const fields = method === 'POST' ? await readFormFields(request.headers, body) : {};
            requests.push({ method, path, headers: request.headers, fields, body });

            const json = (status: number, value: unknown) => {
                response.writeHead(status, { 'content-type': 'application/json' });
                response.end(JSON.stringify(value));
            };

            if (method === 'POST' && path === '/oauth2/authorize') {
                return fields.client_id === 'unknown'
                    ? json(400, { message: 'Unknown clientId' })
                    : json(200, { token_type: 'Bearer', access_token: 'token' });
            }

            if (method === 'POST' && path === '/symsrv/uploadUrl') {
                const refuse = fields.database === 'forbidden' || refuseNextUploadUrl;
                refuseNextUploadUrl = false;
                return refuse
                    ? json(403, {})
                    : json(200, { url: `${host}/presigned/symsrv/${fields.dbgId}/${fields.symFileName}` });
            }

            if (method === 'POST' && path === '/symsrv/uploadComplete') {
                return json(200, { Status: 'Success' });
            }

            if (method === 'POST' && path === '/api/v2/versions') {
                return json(200, { url: `${host}/presigned/versions/${fields.symFileName}` });
            }

            if (method === 'PUT' && path.startsWith('/presigned/')) {
                return json(200, {});
            }

            return json(404, {});
        });
        await new Promise<void>((resolve) => server.listen(0, resolve));
        host = `http://localhost:${(server.address() as AddressInfo).port}`;

        root = await mkdtemp(join(tmpdir(), 'symbol-upload-library-spec-'));
    });

    // A build output folder holding one chunk and its source map, and the options to upload it.
    async function createBuildOutput(): Promise<UploadSymbolsOptions> {
        const directory = await mkdtemp(join(root, 'dist-'));
        await mkdir(join(directory, 'assets'));
        await writeFile(join(directory, 'assets', 'index-BX3k2a9f.js.map'), mapWithDebugId);
        await writeFile(join(directory, 'assets', 'index-BX3k2a9f.js'), 'console.log(1);');

        return {
            database: 'db',
            application: 'app',
            version: '1.0.0',
            clientId: 'id',
            clientSecret: 'secret',
            host,
            directory,
            files: '**/*.map',
        };
    }

    beforeEach(async () => {
        requests = [];
        refuseNextUploadUrl = false;
        options = await createBuildOutput();
        directory = options.directory;

        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    // The uploads' fetch leaves a keep-alive socket open, and close() waits on it forever.
    afterAll(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await rm(root, { recursive: true, force: true });
    });

    const requestsTo = (method: string, path: string, from = requests) =>
        from.filter((request) => request.method === method && request.path.startsWith(path));

    // Uploads once, so that several specs can each assert on one part of the same upload.
    async function uploadOnce(options: UploadSymbolsOptions) {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        requests = [];

        try {
            const symbolFileInfos = await uploadSymbols(options);
            const received = requests;
            return { symbolFileInfos, received };
        } finally {
            log.mockRestore();
        }
    }

    it('should be exported from the package entry point', () => {
        expect(api.uploadSymbols).toBe(uploadSymbols);
    });

    describe('a source map with a debug ID', () => {
        let directory: string;
        let symbolFileInfos: SymbolFileInfo[];
        let received: RecordedRequest[];

        beforeAll(async () => {
            const options = await createBuildOutput();
            directory = options.directory;
            ({ symbolFileInfos, received } = await uploadOnce(options));
        }, 30_000);

        const uploadRequestsTo = (method: string, path: string) => requestsTo(method, path, received);

        it('should resolve with the file and the normalized debug ID it was uploaded by', () => {
            expect(symbolFileInfos).toEqual([
                {
                    path: join(directory, 'assets', 'index-BX3k2a9f.js.map'),
                    dbgId,
                    moduleName: 'index-BX3k2a9f.js.map',
                },
            ]);
        });

        it('should authenticate with the client ID and secret', () => {
            expect(uploadRequestsTo('POST', '/oauth2/authorize')).toHaveLength(1);
            expect(uploadRequestsTo('POST', '/oauth2/authorize')[0].fields).toMatchObject({
                grant_type: 'client_credentials',
                client_id: 'id',
                client_secret: 'secret',
            });
        });

        it('should request an upload URL for the debug ID with the base file name as symFileName and moduleName', () => {
            const [uploadUrl] = uploadRequestsTo('POST', '/symsrv/uploadUrl');
            expect(uploadRequestsTo('POST', '/symsrv/uploadUrl')).toHaveLength(1);
            expect(uploadUrl.fields).toMatchObject({
                database: 'db',
                appName: 'app',
                appVersion: '1.0.0',
                dbgId,
                symFileName: 'index-BX3k2a9f.js.map',
                moduleName: 'index-BX3k2a9f.js.map',
                size: `${Buffer.byteLength(mapWithDebugId)}`,
                SendPdbsVersion: 'spdbsv2',
            });
            expect(uploadUrl.headers.authorization).toBe('Bearer token');
        });

        it('should upload the map gzipped', () => {
            const [put] = uploadRequestsTo('PUT', '/presigned/symsrv/');
            expect(uploadRequestsTo('PUT', '/presigned/')).toHaveLength(1);
            expect(put.path).toBe(`/presigned/symsrv/${dbgId}/index-BX3k2a9f.js.map`);
            expect(put.headers['content-encoding']).toBe('gzip');
            expect(gunzipSync(put.body).toString()).toBe(mapWithDebugId);
        });

        it('should complete the upload with the same debug ID and names', () => {
            const [uploadComplete] = uploadRequestsTo('POST', '/symsrv/uploadComplete');
            expect(uploadRequestsTo('POST', '/symsrv/uploadComplete')).toHaveLength(1);
            expect(uploadComplete.fields).toMatchObject({
                database: 'db',
                appName: 'app',
                appVersion: '1.0.0',
                dbgId,
                symFileName: 'index-BX3k2a9f.js.map',
                moduleName: 'index-BX3k2a9f.js.map',
            });
        });

        it('should not also upload the map by file name and version', () => {
            expect(uploadRequestsTo('POST', '/api/v2/versions')).toHaveLength(0);
        });
    });

    describe('a source map without a debug ID', () => {
        let directory: string;
        let symbolFileInfos: SymbolFileInfo[];
        let received: RecordedRequest[];

        beforeAll(async () => {
            const options = await createBuildOutput();
            directory = options.directory;
            await rm(join(directory, 'assets', 'index-BX3k2a9f.js.map'));
            await writeFile(join(directory, 'assets', 'legacy.js.map'), mapWithoutDebugId);
            ({ symbolFileInfos, received } = await uploadOnce(options));
        }, 30_000);

        const uploadRequestsTo = (method: string, path: string) => requestsTo(method, path, received);

        it('should resolve with the file and an empty dbgId', () => {
            expect(symbolFileInfos).toEqual([
                { path: join(directory, 'assets', 'legacy.js.map'), dbgId: '', moduleName: 'legacy.js.map' },
            ]);
        });

        it('should upload the map zipped, by file name and version', () => {
            const [versions] = uploadRequestsTo('POST', '/api/v2/versions');
            const [put] = uploadRequestsTo('PUT', '/presigned/versions/');
            expect(uploadRequestsTo('POST', '/api/v2/versions')).toHaveLength(1);
            expect(versions.fields).toMatchObject({
                database: 'db',
                appName: 'app',
                appVersion: '1.0.0',
                symFileName: 'legacy.js.map.zip',
            });
            expect(versions.fields.dbgId).toBeUndefined();
            expect(put.path).toBe('/presigned/versions/legacy.js.map.zip');
            expect(put.body.subarray(0, 2).toString()).toBe('PK');
        });

        it('should not upload the map by debug ID', () => {
            expect(uploadRequestsTo('POST', '/symsrv/')).toHaveLength(0);
        });
    });

    describe('files', () => {
        beforeEach(async () => {
            await writeFile(join(directory, 'assets', 'legacy.js.map'), mapWithoutDebugId);
            await writeFile(join(directory, 'root.js.map'), mapWithoutDebugId);
        });

        it('should upload each file matched by any of several globs once', async () => {
            const symbolFileInfos = await uploadSymbols({ ...options, files: ['*.map', '**/*.js.map', 'assets/index-*.map'] });

            expect(symbolFileInfos.map(({ moduleName }) => moduleName).sort()).toEqual([
                'index-BX3k2a9f.js.map',
                'legacy.js.map',
                'root.js.map',
            ]);
            expect(requestsTo('PUT', '/presigned/')).toHaveLength(3);
        }, 30_000);

        it('should resolve globs against a directory whose path contains glob characters', async () => {
            const nested = join(directory, '(group)', '[slug]');
            await mkdir(nested, { recursive: true });
            await writeFile(join(nested, 'page.js.map'), mapWithDebugId);

            await expect(uploadSymbols({ ...options, directory: nested, files: '*.map' })).resolves.toEqual([
                { path: join(nested, 'page.js.map'), dbgId, moduleName: 'page.js.map' },
            ]);
        }, 30_000);

        it('should reject without making a request when no files match', async () => {
            await expect(uploadSymbols({ ...options, files: '**/*.no-such-extension' })).rejects.toThrow(
                `Could not find any files to upload in ${directory} using glob **/*.no-such-extension!`
            );
            expect(requests).toHaveLength(0);
        });
    });

    // The fake rejects this client ID, so these settle on the authentication request alone. That
    // request reaching the fake is what shows which host was used.
    describe('host', () => {
        it('should prefer the host option over BUGSPLAT_HOST', async () => {
            vi.stubEnv('BUGSPLAT_HOST', 'http://localhost:1');

            await expect(uploadSymbols({ ...options, clientId: 'unknown' })).rejects.toThrow(/Unknown clientId/);

            expect(requestsTo('POST', '/oauth2/authorize')).toHaveLength(1);
        }, 30_000);

        it('should fall back to BUGSPLAT_HOST when no host option is provided', async () => {
            vi.stubEnv('BUGSPLAT_HOST', host);

            await expect(uploadSymbols({ ...options, host: undefined, clientId: 'unknown' })).rejects.toThrow(/Unknown clientId/);

            expect(requestsTo('POST', '/oauth2/authorize')).toHaveLength(1);
        }, 30_000);
    });

    describe('cleanup', () => {
        const expectCleanedUp = () => {
            expect(existsSync(tmpDir)).toBe(false);
            expect(process.getActiveResourcesInfo()).not.toContain('MessagePort');
        };

        it('should remove its temp folder and stop its workers when an upload fails', async () => {
            await expect(uploadSymbols({ ...options, database: 'forbidden' })).rejects.toThrow(
                'Not authorized to upload symbols to forbidden'
            );

            expectCleanedUp();
        }, 30_000);

        it('should reject and leave nothing behind when authentication fails', async () => {
            await expect(uploadSymbols({ ...options, clientId: 'unknown' })).rejects.toThrow(/Unknown clientId/);

            expect(requestsTo('POST', '/symsrv/')).toHaveLength(0);
            expectCleanedUp();
        }, 30_000);

        it('should remove its temp folder and stop its workers after uploading, then upload again', async () => {
            await uploadSymbols(options);

            expect(requestsTo('PUT', '/presigned/')).toHaveLength(1);
            expectCleanedUp();

            await uploadSymbols(options);

            expect(requestsTo('PUT', '/presigned/')).toHaveLength(2);
            expectCleanedUp();
        }, 30_000);

        // A dSYM's Mach-O slices are written to the temp folder while the symbol file infos are created,
        // which is before anything is uploaded. Here one slice can't be written and the other can.
        it('should remove its temp folder when a symbol file info cannot be created', async () => {
            const sliceThatFails = join(tmpDir, '2dd1bd2706fa384da5a3a8265921cf9a', 'BugsplatTester');
            await mkdir(sliceThatFails, { recursive: true });

            await expect(
                uploadSymbols({ ...options, directory: resolve('spec/support'), files: 'bugsplat.app.dSYM' })
            ).rejects.toThrow(/EISDIR/);

            expect(requestsTo('POST', '/symsrv/')).toHaveLength(0);
            expectCleanedUp();
        }, 30_000);

        // Removing the temp folder while another file's info is still being created would let that
        // file be written afterwards, into a folder nothing removes.
        it('should wait for every symbol file info before removing its temp folder when one cannot be created', async () => {
            await writeFile(join(directory, 'assets', 'slow.js.map'), mapWithDebugId);
            let slowInfoCreated = false;
            vi.spyOn(info, 'createSymbolFileInfos').mockImplementation(async (path) => {
                if (!path.endsWith('slow.js.map')) {
                    throw new Error(`Could not read ${basename(path)}`);
                }

                await new Promise((resolve) => setTimeout(resolve, 50));
                await mkdir(tmpDir, { recursive: true });
                await writeFile(join(tmpDir, 'slow'), '');
                slowInfoCreated = true;
                return [];
            });

            await expect(uploadSymbols(options)).rejects.toThrow('Could not read index-BX3k2a9f.js.map');

            expect(slowInfoCreated).toBe(true);
            expectCleanedUp();
        }, 30_000);

        // The temp folder and the workers are shared, so a call that cleaned up while another was
        // still uploading would pull both out from under it.
        it('should run calls made at once one after another', async () => {
            const results = await Promise.allSettled([
                uploadSymbols(options),
                uploadSymbols({ ...options, database: 'forbidden' }),
                uploadSymbols(options),
            ]);

            expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
            expect(requests.map(({ method, path }) => `${method} ${path.split('/').slice(0, 3).join('/')}`)).toEqual([
                'POST /oauth2/authorize',
                'POST /symsrv/uploadUrl',
                'PUT /presigned/symsrv',
                'POST /symsrv/uploadComplete',
                'POST /oauth2/authorize',
                'POST /symsrv/uploadUrl',
                'POST /oauth2/authorize',
                'POST /symsrv/uploadUrl',
                'PUT /presigned/symsrv',
                'POST /symsrv/uploadComplete',
            ]);
            expectCleanedUp();
        }, 30_000);

        // A bundler that calls uploadSymbols must be able to finish on its own afterwards, so run it in
        // a process that fails the spec if it has to be killed or calls process.exit().
        it('should let the calling process exit on its own', async () => {
            const { code, output } = await uploadInChildProcess(options);

            expect(output).toContain(`UPLOADED ${dbgId}`);
            expect(output).not.toContain('FORCED_EXIT');
            expect(code).toBe(0);
        }, 30_000);

        // Each upload worker gets two files, and the first upload URL any of them asks for is refused.
        // That worker fails at once, while the others are still part way through their first file.
        describe('when one upload fails while others are in progress', () => {
            const fileCount = availableParallelism() * 2;

            beforeEach(async () => {
                await rm(join(directory, 'assets', 'index-BX3k2a9f.js.map'));
                await Promise.all(
                    Array.from({ length: fileCount }, (_, i) => {
                        const debugId = `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
                        return writeFile(join(directory, 'assets', `chunk-${i}.js.map`), JSON.stringify({ version: 3, mappings: 'AAAA', debugId }));
                    })
                );
                refuseNextUploadUrl = true;
            });

            it('should reject once the uploads in progress have finished', async () => {
                await expect(uploadSymbols(options)).rejects.toThrow('Not authorized to upload symbols to db');

                const accepted = requestsTo('POST', '/symsrv/uploadUrl').length - 1;
                expect(requestsTo('PUT', '/presigned/')).toHaveLength(accepted);
                expect(requestsTo('POST', '/symsrv/uploadComplete')).toHaveLength(accepted);
                expectCleanedUp();
            }, 30_000);

            it('should let the calling process exit on its own', async () => {
                const { code, output } = await uploadInChildProcess(options);

                expect(output).toContain('REJECTED Not authorized to upload symbols to db');
                expect(output).not.toContain('FORCED_EXIT');
                expect(code).toBe(1);
            }, 30_000);
        });
    });

    describe('options', () => {
        it.each(['database', 'application', 'version', 'clientId', 'clientSecret', 'directory', 'files'] as const)(
            'should reject without making a request when %s is missing',
            async (name) => {
                await expect(uploadSymbols({ ...options, [name]: undefined })).rejects.toThrow(`Missing option: ${name}`);
                expect(requests).toHaveLength(0);
            }
        );

        it('should reject when files is an empty array', async () => {
            await expect(uploadSymbols({ ...options, files: [] })).rejects.toThrow('Missing option: files');
        });
    });
});

async function readFormFields(headers: IncomingHttpHeaders, body: Buffer): Promise<Record<string, string>> {
    const contentType = headers['content-type'] ?? '';
    const formData = await new Response(new Uint8Array(body), { headers: { 'content-type': contentType } }).formData();
    const fields: Record<string, string> = {};
    formData.forEach((value, name) => (fields[name] = `${value}`));
    return fields;
}

// Calls uploadSymbols in a process of its own, which then has to finish without being told to.
function uploadInChildProcess(options: UploadSymbolsOptions): Promise<{ code: number | null; output: string }> {
    const script = `
        const { uploadSymbols } = require('./src/upload-symbols.ts');
        uploadSymbols(JSON.parse(process.env.UPLOAD_SYMBOLS_OPTIONS)).then(
            (symbolFileInfos) => console.log('UPLOADED ' + symbolFileInfos.map(({ dbgId }) => dbgId).join(',')),
            (error) => { console.log('REJECTED ' + error.message); process.exitCode = 1; }
        );
    `;

    return run(
        ['-r', './spec/support/detect-forced-exit.js', '-r', 'ts-node/register', '-e', script],
        { UPLOAD_SYMBOLS_OPTIONS: JSON.stringify(options) }
    );
}

function run(nodeArgs: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; output: string }> {
    const timeout = 25_000;

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, nodeArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, ...env },
        });

        // Kill the child ourselves so a hang can't outlive the spec and orphan a process.
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`The process did not exit within ${timeout}ms`));
        }, timeout);

        let output = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (data) => (output += data));
        child.stderr.on('data', (data) => (output += data));
        child.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code, output });
        });
    });
}
