#! /usr/bin/env node
import { ApiClient, BugSplatApiClient, OAuthClientCredentialsClient, UploadableFile, VersionsApiClient } from '@bugsplat/js-api-client';
import AdmZip from 'adm-zip';
import commandLineArgs, { CommandLineOptions } from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import firstline from 'firstline';
import { createReadStream, existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import glob from 'glob-promise';
import { basename, extname } from 'path';
import { argDefinitions, CommandLineDefinition, usageDefinitions } from './command-line-definitions';
import { FormDataFile, postAndroidBinary } from './post-android-binary';

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
        directory
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

    const globPattern = `${directory}/${files}`;

    try {
        const paths = await glob(globPattern);

        if (!paths.length) {
            throw new Error(`Could not find any files to upload using glob ${globPattern}!`);
        }

        console.log(`Found files:\n ${paths}`);
        console.log(`About to upload symbols for ${database}-${application}-${version}...`);

        // Android binaries are posted to a separate endpoint where BugSplat transforms them into sym files
        const isAndroidBinary = path => path.toLowerCase().endsWith('.so');
        const nonAndroidPaths = paths.filter(path => !isAndroidBinary(path));
        const nonAndroidSymbols = await Promise.all(
            nonAndroidPaths.map(async (path) => {
                const zip = new AdmZip();
                zip.addLocalFile(path);

                const fileName = basename(path);
                const timestamp = Math.round(new Date().getTime() / 1000);
                const isSymFile = extname(path).toLowerCase().includes('.sym');
                let name = `${fileName}-${timestamp}.zip`;

                if (isSymFile) {
                    const debugId = await getSymFileDebugId(path);
                    name = `${fileName}-${debugId}-${timestamp}-bsv1.zip`;
                }

                const file = zip.toBuffer();
                const size = file.length;
                return {
                    name,
                    size,
                    file
                } as UploadableFile;
            })
        );

        await versionsApiClient.postSymbols(
            database,
            application,
            version,
            nonAndroidSymbols
        );

        const androidPaths = paths.filter(path => isAndroidBinary(path));
        const androidBinaryFiles = await Promise.all(
            androidPaths.map(async path => {
                const name = basename(path);
                const file = new Blob([await readFile(path)]);
                const { size } = await stat(path);
                return {
                    name,
                    file,
                    path,
                    size,
                } as FormDataFile;
            })
        );

        // Authenticate against app backend
        const androidUploadApiClient = await createBugSplatClient({
            user,
            password,
            clientId,
            clientSecret
        });

        // Post binary to processing fleet
        // Don't try this at home kids!
        (androidUploadApiClient as any)._host = `https://${database}.bugsplat.com`;
        
        await postAndroidBinary(database, application, version, androidBinaryFiles, androidUploadApiClient);

        console.log('Symbols uploaded successfully!');
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
})();

async function createBugSplatClient({
    user,
    password,
    clientId,
    clientSecret,
    host
}: AuthenticationArgs): Promise<ApiClient> {
    let client;

    if (user && password) {
        client = await BugSplatApiClient.createAuthenticatedClientForNode(user, password, host);
    } else {
        client = await OAuthClientCredentialsClient.createAuthenticatedClient(clientId, clientSecret, host);
    }

    return client;
}

async function getCommandLineOptions(argDefinitions: Array<CommandLineDefinition>): Promise<CommandLineOptions> {
    const options = commandLineArgs(argDefinitions);
    let { application, version } = options;
    let packageJson;

    if (!application || !version) {
        const packageJsonPath = './package.json';
        packageJson = existsSync(packageJsonPath) ? JSON.parse((await readFile(packageJsonPath)).toString()) : null;
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
    };
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
    clientSecret: string,
    host?: string
}