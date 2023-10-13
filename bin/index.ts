#! /usr/bin/env node
import { ApiClient, BugSplatApiClient, OAuthClientCredentialsClient, SymbolsApiClient, VersionsApiClient } from '@bugsplat/js-api-client';
import commandLineArgs, { CommandLineOptions } from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import glob from 'glob-promise';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import { CommandLineDefinition, argDefinitions, maxParallelThreads, usageDefinitions } from './command-line-definitions';
import { createGzipFile } from './gzip';
import { tryGetPdbGuid, tryGetPeGuid } from './pdb';
import { SymbolFileInfo, SymbolFileType } from './symbol-file-info';
import { safeRemoveTmp, tmpDir } from './tmp';
import { createWorkersFromSymbolFiles } from './worker';
import { createZipFile } from './zip';
import { getSymFileInfo } from './sym';

(async () => {
    let {
        help,
        database,
        application,
        version,
        user,
        password,
        clientId,
        clientSecret,
        remove,
        files,
        directory,
        threads
    } = await getCommandLineOptions(argDefinitions);

    if (help) {
        logHelpAndExit();
    }

    database = database ?? process.env.BUGSPLAT_DATABASE;
    user = user ?? process.env.SYMBOL_UPLOAD_USER;
    password = password ?? process.env.SYMBOL_UPLOAD_PASSWORD;
    clientId = clientId ?? process.env.SYMBOL_UPLOAD_CLIENT_ID;
    clientSecret = clientSecret ?? process.env.SYMBOL_UPLOAD_CLIENT_SECRET;

    if (!database) {
        logMissingArgAndExit('database');
    }

    if (!application) {
        logMissingArgAndExit('application');
    }

    if (!version) {
        logMissingArgAndExit('version');
    }

    if (
        !validAuthenticationArguments({
            user,
            password,
            clientId,
            clientSecret
        })
    ) {
        logMissingAuthAndExit();
    }

    if (threads > maxParallelThreads) {
        console.log(`Maximum number of upload threads is ${maxParallelThreads}, using ${maxParallelThreads} instead...`);
        threads = maxParallelThreads;
    }

    console.log('About to authenticate...')

    const bugsplat = await createBugSplatClient({
        user,
        password,
        clientId,
        clientSecret
    });

    console.log('Authentication success!');

    const versionsApiClient = new VersionsApiClient(bugsplat);
    const symbolsApiClient = new SymbolsApiClient(bugsplat);

    if (remove) {
        try {
            console.log(`About to delete symbols for ${database}-${application}-${version}...`);

            await versionsApiClient.deleteSymbols(
                database,
                application,
                version
            );

            console.log('Symbols deleted successfully!');
        } catch (error) {
            console.error(error);
            process.exit(1);
        } finally {
            return;
        }
    }

    directory = normalizeDirectory(directory);
    const globPattern = `${directory}/${files}`;

    let returnCode = 0;
    try {
        const symbolFilePaths = await glob(globPattern);

        if (!symbolFilePaths.length) {
            throw new Error(`Could not find any files to upload using glob ${globPattern}!`);
        }

        console.log(`Found files:\n ${symbolFilePaths.join('\n')}`);
        console.log(`About to upload symbols for ${database}-${application}-${version}...`);

        if (!existsSync(tmpDir)) {
            await mkdir(tmpDir);
        }

        const symbolFiles = await Promise.all(symbolFilePaths.map(async (symbolFilePath) => await createSymbolFileInfo(directory, symbolFilePath)));
        const workers = createWorkersFromSymbolFiles(symbolFiles, threads,[symbolsApiClient, versionsApiClient]);
        const uploads = workers.map((worker) => worker.upload(database, application, version));
        await Promise.all(uploads);

        console.log('Symbols uploaded successfully!');
    } catch (error) {
        console.error(error);
        returnCode = 1;
    } finally {
        await safeRemoveTmp();
    }

    process.exit(returnCode);
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});

async function createSymbolFileInfo(directory: string, symbolFilePath: string): Promise<SymbolFileInfo> {

    const folderPrefix = relative(directory, dirname(symbolFilePath)).replace(/\\/g, '-');
    const fileName = folderPrefix ? [folderPrefix, basename(symbolFilePath)].join('-') : basename(symbolFilePath);
    const stats = await stat(symbolFilePath);
    const extLowerCase = extname(symbolFilePath).toLowerCase();
    const isSymFile = extLowerCase.includes('.sym');
    const isPdbFile = extLowerCase.includes('.pdb');
    const isPeFile = extLowerCase.includes('.exe') || extLowerCase.includes('.dll');

    const timestamp = Math.round(new Date().getTime() / 1000);
    let dbgId = '';
    let moduleName = '';
    let tmpFileName = '';
    let type = SymbolFileType.legacy;

    if (isPdbFile) {
        dbgId = await tryGetPdbGuid(symbolFilePath);
    }

    if (isPeFile) {
        dbgId = await tryGetPeGuid(symbolFilePath);
    }

    if (isSymFile) {
        ({ dbgId, moduleName } = await getSymFileInfo(symbolFilePath));
    }

    if (dbgId) {  
        tmpFileName = join(tmpDir, `${fileName}.gz`);
        type = SymbolFileType.symserv;
        await createGzipFile(symbolFilePath, tmpFileName);
    } else {
        tmpFileName = join(tmpDir, `${fileName}-${timestamp}.zip`);
        type = SymbolFileType.legacy;
        await createZipFile([symbolFilePath], tmpFileName);
    }

    moduleName = moduleName || basename(symbolFilePath);
    const lastModified = new Date(stats.mtime);
    const name = basename(tmpFileName);
    const uncompressedSize = stats.size;
    const size = (await stat(tmpFileName)).size;
    const file = tmpFileName;
    return {
        name,
        size,
        uncompressedSize,
        file,
        dbgId,
        moduleName,
        lastModified,
        type
    } as SymbolFileInfo;
}

async function createBugSplatClient({
    user,
    password,
    clientId,
    clientSecret
}: AuthenticationArgs): Promise<ApiClient> {
    const host = process.env.BUGSPLAT_HOST;

    if (user && password) {
        return BugSplatApiClient.createAuthenticatedClientForNode(user, password, host);
    }

    return OAuthClientCredentialsClient.createAuthenticatedClient(clientId, clientSecret, host);
}

async function fileExists(path: string): Promise<boolean> {
    try {
        return !!(await stat(path));
    } catch {
        return false;
    }
}

async function getCommandLineOptions(argDefinitions: Array<CommandLineDefinition>): Promise<CommandLineOptions> {
    const options = commandLineArgs(argDefinitions);
    let { application, version } = options;
    let packageJson;

    if (!application || !version) {
        const packageJsonPath = './package.json';
        packageJson = await fileExists(packageJsonPath) ? JSON.parse((await readFile(packageJsonPath)).toString()) : null;
    }

    if (!application && packageJson) {
        application = packageJson.name;
    }

    if (!version && packageJson) {
        version = packageJson.version;
    }

    return {
        ...options,
        application,
        version
    }
}

function logHelpAndExit() {
    const help = commandLineUsage(usageDefinitions);
    console.log(help);
    process.exit(1);
}

function logMissingArgAndExit(arg: string): void {
    console.log(`\nMissing argument: -${arg}\n`);
    process.exit(1);
}

function logMissingAuthAndExit(): void {
    console.log('\nInvalid authentication arguments: please provide either a user and password, or a clientId and clientSecret\n');
    process.exit(1);
}

function normalizeDirectory(directory: string): string {
    return directory.replace(/\\/g, '/');
}

function validAuthenticationArguments({
    user,
    password,
    clientId,
    clientSecret
}: AuthenticationArgs): boolean {
    return !!(user && password) || !!(clientId && clientSecret);
}

interface AuthenticationArgs {
    user: string,
    password: string,
    clientId: string,
    clientSecret: string
}