#! /usr/bin/env node
import { ApiClient, BugSplatApiClient, OAuthClientCredentialsClient, SymbolsApiClient } from '@bugsplat/js-api-client';
import commandLineArgs, { CommandLineOptions } from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import fs from 'fs';
import { readFile, stat } from 'fs/promises';
import glob from 'glob-promise';
import { basename } from 'path';
import { argDefinitions, CommandLineDefinition, usageDefinitions } from './command-line-definitions';

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

    database = database ?? process.env.SYMBOL_UPLOAD_DATABASE;
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

    const symbolsApiClient = new SymbolsApiClient(bugsplat);

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

        const files = paths.map(path => {
            const stat = fs.statSync(path);
            const size = stat.size;
            const name = basename(path);
            const file = fs.createReadStream(path);
            return {
                name,
                size,
                file
            };
        });

        await symbolsApiClient.postSymbols(
            database,
            application,
            version,
            files
        );

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