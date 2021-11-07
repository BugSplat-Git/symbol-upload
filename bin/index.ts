#! /usr/bin/env node
import { ApiClient, BugSplatApiClient, SymbolsApiClient } from '@bugsplat/js-api-client';
import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import fs from 'fs';
import glob from 'glob-promise';
import { basename } from 'path';
import { argDefinitions, usageDefinitions } from './command-line-definitions';

let {
    help,
    database,
    application,
    version,
    user,
    password,
    remove,
    files,
    directory
} = commandLineArgs(argDefinitions);

if (help) {
    logHelpAndExit();    
}

if (!database) {
    logMissingArgAndExit('database');
}

if (!application) {
    logMissingArgAndExit('application');
}

if (!version) {
    logMissingArgAndExit('version');
}

user = user ?? process.env.SYMBOL_UPLOAD_USER;
password = password ?? process.env.SYMBOL_UPLOAD_PASSWORD;

if (
    !validAuthenticationArguments({
        user,
        password
    })
) {
    logMissingAuthAndExit();
}

(async () => {

    console.log('About to authenticate...')

    const bugsplat = await createBugSplatClient({
        user,
        password
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
    password
}: AuthenticationArgs): Promise<ApiClient> {
    return BugSplatApiClient.createAuthenticatedClientForNode(user, password);
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
    console.log('\nInvalid authentication arguments: please provide a user and password\n');
    process.exit(1);
}

function validAuthenticationArguments({
    user,
    password
}: AuthenticationArgs): boolean {
    return !!(user && password);
}

interface AuthenticationArgs {
    user: string,
    password: string
}