#! /usr/bin/env node
import { ApiClient, BugSplatApiClient, OAuthClientCredentialsClient, SymbolsApiClient, VersionsApiClient } from '@bugsplat/js-api-client';
import commandLineArgs, { CommandLineOptions } from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import { glob } from 'glob';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import { pool } from 'workerpool';
import { CommandLineDefinition, argDefinitions, usageDefinitions } from './command-line-definitions';
import { SymbolFileInfo } from './info';
import { tryGetPdbGuid, tryGetPeGuid } from './pdb';
import { getSymFileInfo } from './sym';
import { safeRemoveTmp, tmpDir } from './tmp';
import { createWorkersFromSymbolFiles } from './worker';

const workerPool = pool(join(__dirname, 'compression.js'));

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
        const workers = createWorkersFromSymbolFiles(workerPool, symbolFiles, [symbolsApiClient, versionsApiClient]);
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

async function createSymbolFileInfo(searchDirectory: string, symbolFilePath: string): Promise<SymbolFileInfo> {
    const path = symbolFilePath;
    const relativePath = relative(searchDirectory, dirname(path));
    const extLowerCase = extname(path).toLowerCase();
    const isSymFile = extLowerCase.includes('.sym');
    const isPdbFile = extLowerCase.includes('.pdb');
    const isPeFile = extLowerCase.includes('.exe') || extLowerCase.includes('.dll');

    let dbgId = '';
    let moduleName = '';

    if (isPdbFile) {
        dbgId = await tryGetPdbGuid(path);
    }

    if (isPeFile) {
        dbgId = await tryGetPeGuid(path);
    }

    if (isSymFile) {
        ({ dbgId, moduleName } = await getSymFileInfo(path));
    }

    moduleName = moduleName || basename(path);

    return {
        path,
        dbgId,
        moduleName,
        relativePath
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