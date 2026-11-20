import { glob } from 'glob';
import { mkdir } from 'node:fs/promises';
import { createBugSplatClient } from './auth';
import { createSymbolFileInfos, filterSymbolFilePaths, SymbolFileInfo } from './info';
import { safeRemoveTmp, tmpDir } from './tmp';
import { terminateWorkerPoolWhenIdle, uploadSymbolFiles } from './upload';

export interface UploadSymbolsOptions {
    /** BugSplat database name. Must match the database crash reports are posted to. */
    database: string;
    /** Application name. Must match the application crash reports are posted with. */
    application: string;
    /** Application version. Must match the version crash reports are posted with. */
    version: string;
    /** OAuth2 Client Credentials Client ID for the database. */
    clientId: string;
    /** OAuth2 Client Credentials Client Secret for the database. */
    clientSecret: string;
    /**
     * Base URL of the BugSplat API, used for authentication and for every upload request.
     * Defaults to the BUGSPLAT_HOST environment variable, then https://api.bugsplat.com.
     */
    host?: string;
    /** Base directory the globs in files are resolved against. */
    directory: string;
    /** One or more glob patterns, relative to directory and written with forward slashes. */
    files: string | string[];
}

const requiredOptions = ['database', 'application', 'version', 'clientId', 'clientSecret', 'directory'] as const;

// The temp folder and the worker pool are shared by the whole process. Running one upload at a time
// keeps a call that finishes from removing the folder, or stopping the pool, under one still running.
let previousUpload: Promise<unknown> = Promise.resolve();

/**
 * Finds the files matched by the globs, authenticates, and uploads them to BugSplat.
 *
 * Unlike uploadSymbolFiles this needs no setup or teardown: it creates and removes its own temp
 * folder and stops its compression workers before settling, so it never keeps the calling process
 * (a bundler, a build script) alive. Calls made while another is in flight run after it.
 *
 * Resolves with the files that were found and the debug ID each was uploaded by. dbgId is an empty
 * string for a file with no debug ID, such as a source map that doesn't contain one.
 * Rejects if no files match, if authentication fails, or if any upload fails.
 */
export function uploadSymbols(options: UploadSymbolsOptions): Promise<SymbolFileInfo[]> {
    const upload = previousUpload.then(() => findAndUploadSymbols(options));
    previousUpload = upload.catch(() => undefined);
    return upload;
}

async function findAndUploadSymbols(options: UploadSymbolsOptions): Promise<SymbolFileInfo[]> {
    const { database, application, version, clientId, clientSecret, host, directory } = validate(options);
    const patterns = [options.files].flat();

    // Matching inside cwd, rather than joining the directory onto each pattern, keeps glob characters
    // in the directory's own path (a Next.js "[slug]" or "(group)" folder) from being read as a pattern.
    const matches = await glob(patterns, { cwd: directory, absolute: true });
    const symbolFilePaths = await filterSymbolFilePaths([...new Set(matches)]);

    if (!symbolFilePaths.length) {
        throw new Error(`Could not find any files to upload in ${directory} using glob ${patterns.join(', ')}!`);
    }

    const bugsplat = await createBugSplatClient({ clientId, clientSecret }, host || undefined);

    try {
        await mkdir(tmpDir, { recursive: true });

        // Creating the info for a dSYM writes its Mach-O slices to tmpDir, so this belongs in here.
        // Wait for every file, even once one has failed, so that none is still being written when
        // tmpDir is removed.
        const creatingSymbolFileInfos = symbolFilePaths.map((symbolFilePath) => createSymbolFileInfos(symbolFilePath));
        await Promise.allSettled(creatingSymbolFileInfos);
        const symbolFileInfos = await Promise.all(creatingSymbolFileInfos).then((array) => array.flat());

        await uploadSymbolFiles(bugsplat, database, application, version, symbolFileInfos);

        return symbolFileInfos;
    } finally {
        // Stop the workers before removing tmpDir. A rejected upload leaves sibling workers mid-gzip,
        // and deleting the directory out from under them means noisy worker failures and file locks
        // on Windows. An upload that another caller started with uploadSymbolFiles uses the same
        // workers and tmpDir, so wait for it to finish before doing either.
        await terminateWorkerPoolWhenIdle();
        await safeRemoveTmp();
    }
}

function validate(options: UploadSymbolsOptions): UploadSymbolsOptions {
    for (const name of requiredOptions) {
        if (!options?.[name] || typeof options[name] !== 'string') {
            throw new Error(`Missing option: ${name}`);
        }
    }

    const patterns = [options.files].flat();
    if (!patterns.length || patterns.some((pattern) => !pattern || typeof pattern !== 'string')) {
        throw new Error('Missing option: files');
    }

    return options;
}
