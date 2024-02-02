#! /usr/bin/env node
import { ApiClient, BugSplatApiClient, OAuthClientCredentialsClient, VersionsApiClient } from '@bugsplat/js-api-client';
import commandLineArgs, { CommandLineOptions } from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { uploadSymbolFiles } from '../src/upload';
import { CommandLineDefinition, argDefinitions, usageDefinitions } from './command-line-definitions';
import { safeRemoveTmp, tmpDir } from '../src/tmp';
import { existsSync } from 'node:fs';

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

    await uploadSymbolFiles(bugsplat, database, application, version, directory, files);

    process.exit(0);
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
}).finally(async () => {
    await safeRemoveTmp();
})

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