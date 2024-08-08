#! /usr/bin/env node
import { ApiClient, BugSplatApiClient, OAuthClientCredentialsClient, VersionsApiClient } from '@bugsplat/js-api-client';
import commandLineArgs, { CommandLineOptions } from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import { existsSync, mkdirSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { fileExists } from '../src/fs';
import { globFiles } from '../src/glob';
import { importNodeDumpSyms } from '../src/preload';
import { safeRemoveTmp, tmpDir } from '../src/tmp';
import { uploadSymbolFiles } from '../src/upload';
import { CommandLineDefinition, argDefinitions, usageDefinitions } from './command-line-definitions';

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
        dumpSyms
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
        clientSecret,
    });

    console.log('Authentication success!');

    if (remove) {
        try {
            const versionsApiClient = new VersionsApiClient(bugsplat);

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

    if (!existsSync(tmpDir)) {
        await mkdir(tmpDir);
    }

    const globPattern = `${directory}/${files}`;

    let symbolFilePaths = await globFiles(globPattern);

    if (!symbolFilePaths.length) {
        throw new Error(`Could not find any files to upload using glob ${globPattern}!`);
    }

    console.log(`Found files:\n ${symbolFilePaths.join('\n')}`);

    if (dumpSyms) {
        try {
            const nodeDumpSyms = (await importNodeDumpSyms()).dumpSyms;
            symbolFilePaths = symbolFilePaths.map(file => {
                console.log(`Dumping syms for ${file}...`);
                const symFile = join(tmpDir, `${getSymFileBaseName(file)}.sym`);
                mkdirSync(dirname(symFile), { recursive: true });
                nodeDumpSyms(file, symFile);
                return symFile;
            });
        } catch (cause) {
            throw new Error('Can\'t run dump_syms! Please ensure node-dump-syms is installed https://github.com/BugSplat-Git/node-dump-syms', { cause });
        }
    }

    await uploadSymbolFiles(bugsplat, database, application, version, symbolFilePaths);
    await safeRemoveTmp();
    process.exit(0);
})().catch(async (error) => {
    await safeRemoveTmp();
    console.error(error.message);
    process.exit(1);
});

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


async function getCommandLineOptions(argDefinitions: Array<CommandLineDefinition>): Promise<CommandLineOptions> {
    const options = commandLineArgs(argDefinitions);
    let { database, application, version } = options;
    let packageJson;

    if (!database || !application || !version) {
        const packageJsonPath = './package.json';
        packageJson = await fileExists(packageJsonPath) ? JSON.parse((await readFile(packageJsonPath)).toString()) : null;
    }

    if (!database && packageJson) {
        database = packageJson.database;
    }

    if (!application && packageJson) {
        application = packageJson.name;
    }

    if (!version && packageJson) {
        version = packageJson.version;
    }

    return {
        ...options,
        database,
        application,
        version
    }
}

// The rust-minidump-stackwalker symbol lookup implementation removes some extensions from the sym file name for symbol lookups.
// This is a bit of a mystery and is subject to change when we learn more about how it works.
// For now, remove any non .so extension in the sym file's base name to satisfy the minidump-stackwalker symbol lookup.
function getSymFileBaseName(file: string): string {
    const linuxSoExtensionPattern = /\.so\.?.*$/gm;
    return linuxSoExtensionPattern.test(file) ? basename(file) : removeExtensionRecursive(file);
}

function logHelpAndExit() {
    const help = commandLineUsage(usageDefinitions);
    console.log(help);
    process.exit(1);
}

function logMissingArgAndExit(arg: string): void {
    console.log(`\nMissing argument: -${arg}\n`);
    logHelpAndExit()
}

function logMissingAuthAndExit(): void {
    console.log('\nInvalid authentication arguments: please provide either a user and password, or a clientId and clientSecret\n');
    logHelpAndExit()
}

function normalizeDirectory(directory: string): string {
    return directory.replace(/\\/g, '/');
}

// The extname function will return .dSYM for bugsplat.app.dSYM
// When processing, we want to our file name for bugsplat.app.dSYM to be bugsplat.sym
// This function will remove extensions recursively until there are none left
function removeExtensionRecursive(file: string): string {
    const ext = extname(file);
    return ext ? removeExtensionRecursive(basename(file, ext)) : file;
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