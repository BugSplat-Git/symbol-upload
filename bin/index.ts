#! /usr/bin/env node
import { ApiClient, BugSplatApiClient, OAuthClientCredentialsClient, UploadableFile, VersionsApiClient } from '@bugsplat/js-api-client';
import AdmZip from 'adm-zip';
import commandLineArgs, { CommandLineOptions } from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import firstline from 'firstline';
import { lstat, readFile, stat } from 'fs/promises';
import glob from 'glob-promise';
import { basename, extname } from 'path';
import { CommandLineDefinition, argDefinitions, usageDefinitions } from './command-line-definitions';
import { createWorkersFromSymbolFiles } from './worker';

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

    const globPattern = `${directory}/${files}`;

    try {
        const paths = await glob(globPattern);

        if (!paths.length) {
            throw new Error(`Could not find any files to upload using glob ${globPattern}!`);
        }

        console.log(`Found files:\n ${paths}`);
        console.log(`About to upload symbols for ${database}-${application}-${version}...`);

        const files = await Promise.all(
            paths.map(async (path) => {
                const zip = new AdmZip(); 
                const isDirectory = (await lstat(path)).isDirectory();

                if (isDirectory) {
                    zip.addLocalFolder(path);
                } else {
                    zip.addLocalFile(path);
                }
                
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

        const workers = createWorkersFromSymbolFiles(symbolsApiClient, files, threads);
        const uploads = workers.map((worker) => worker.upload(database, application, version));
        await Promise.all(uploads);

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
    clientSecret
}: AuthenticationArgs): Promise<ApiClient> {
    let client;

    if (user && password) {
        client = await BugSplatApiClient.createAuthenticatedClientForNode(user, password);
    } else {
        client = await OAuthClientCredentialsClient.createAuthenticatedClient(clientId, clientSecret);
    }

    return client;
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