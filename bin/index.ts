#! /usr/bin/env node
import { ApiClient, BugSplatApiClient, OAuthClientCredentialsClient, SymbolFile, UploadableFile, VersionsApiClient } from '@bugsplat/js-api-client';
import commandLineArgs, { CommandLineOptions } from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import firstline from 'firstline';
import { createReadStream, existsSync } from 'fs';
import { mkdir, readFile, rm, stat } from 'fs/promises';
import glob from 'glob-promise';
import { basename, dirname, extname, join, relative } from 'path';
import { CommandLineDefinition, argDefinitions, maxParallelThreads, usageDefinitions } from './command-line-definitions';
import { createWorkersFromSymbolFiles } from './worker';
import { Zip } from './zip';

const currentDirectory = process ? process.cwd() : __dirname;
const tmpDir = join(currentDirectory, 'tmp');

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

    const symbolsApiClient = new VersionsApiClient(bugsplat);

    if (remove) {
        try {
            console.log(`About to delete symbols for ${database}-${application}-${version}...`);

            await symbolsApiClient.deleteSymbols(
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

        const symbolFiles = await Promise.all(symbolFilePaths.map(async (symbolFilePath) => await createSymbolFile(directory, symbolFilePath)));
        const workers = createWorkersFromSymbolFiles(symbolsApiClient, symbolFiles, threads);
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
})();

async function createSymbolFile(directory: string, symbolFilePath: string): Promise<SymbolFile> {
    const zip = new Zip();

    const folderPrefix = relative(directory, dirname(symbolFilePath)).replace(/\\/g, '-');
    const fileName = folderPrefix ? [folderPrefix, basename(symbolFilePath)].join('-') : basename(symbolFilePath);
    const timestamp = Math.round(new Date().getTime() / 1000);

    const isSymFile = extname(symbolFilePath).toLowerCase().includes('.sym');

    let additionalParams = {};
    let tmpZipName = join(tmpDir, `${fileName}-${timestamp}.zip`);

    if (isSymFile) {
        const dbgId = await getSymFileDebugId(symbolFilePath);
        const moduleName = basename(symbolFilePath);
        const lastModified = timestamp;
        tmpZipName = join(tmpDir, `${fileName}-${dbgId}-${timestamp}-bsv1.zip`);
        additionalParams = {
            dbgId,
            moduleName,
            lastModified
        };
    }

    await zip.addEntry(symbolFilePath);
    await zip.write(tmpZipName);

    const name = basename(tmpZipName);
    const file = createReadStream(tmpZipName);
    const size = (await stat(tmpZipName)).size;
    return {
        name,
        size,
        file,
        ...additionalParams
    } as SymbolFile;
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

async function getSymFileDebugId(path: string): Promise<string> {
    try {
        const uuidRegex = /[0-9a-fA-F]{33}/gm
        const firstLine = await firstline(path);
        const matches = firstLine.match(uuidRegex);
        return matches?.[0] ?? '';
    } catch {
        console.log(`Could not get debugId for ${path}, skipping...`);
        return '';
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

async function safeRemoveTmp(): Promise<void> {
    try {
        await rm(tmpDir, { recursive: true, force: true });
    } catch (error) {
        console.error(`Could not delete ${tmpDir}!`, error);
    }
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