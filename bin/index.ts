#! /usr/bin/env node
import { BugSplatApiClient, SymbolsApiClient } from '@bugsplat/js-api-client';
import fs from 'fs';
import glob from 'glob-promise';
import { basename } from 'path';

(async () => {
    if (
        process.argv.some(arg => arg === '-h')
        || process.argv.some(arg => arg === '/h')
        || process.argv.some(arg => arg === '-help')
        || process.argv.some(arg => arg === '/help')
        || process.argv.length <= 1
    ) {
        helpAndExit();
    }

    const databaseFlag = <string>process.argv.find(arg => arg === '-database');
    if (!databaseFlag) {
        missingArg('database');
    }

    const applicationFlag = <string>process.argv.find(arg => arg === '-application');
    if (!applicationFlag) {
        missingArg('application');
    }

    const versionFlag = <string>process.argv.find(arg => arg === '-version');
    if (!versionFlag) {
        missingArg('version');
    }

    const emailFlag = <string>process.argv.find(arg => arg === '-email');
    const email = emailFlag ? process.argv[process.argv.indexOf(emailFlag) + 1] : <string>process.env.SYMBOL_UPLOAD_EMAIL;
    if (!email) {
        missingArg('email');
    }

    const passwordFlag = <string>process.argv.find(arg => arg === '-password');
    const password = passwordFlag ? process.argv[process.argv.indexOf(passwordFlag) + 1] : <string>process.env.SYMBOL_UPLOAD_PASSWORD;
    if (!password) {
        missingArg('password');
    }

    const database = process.argv[process.argv.indexOf(databaseFlag) + 1];
    const application = process.argv[process.argv.indexOf(applicationFlag) + 1];
    const version = process.argv[process.argv.indexOf(versionFlag) + 1];

    const deleteFlag = <string>process.argv.find(arg => arg === '-delete');
    if (deleteFlag) {
        try {
            console.log(`About to log into BugSplat with user ${email}...`);
    
            const bugsplat = new BugSplatApiClient();
            await bugsplat.login(email, password);
    
            console.log('Login successful!');
            console.log(`About to delete symbols for ${database}-${application}-${version}...`);

            const symbolsApiClient = new SymbolsApiClient(bugsplat);
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

    const filesFlag = <string>process.argv.find(arg => arg === '-files');
    const directoryFlag = <string>process.argv.find(arg => arg === '-directory');
    const files = process.argv.indexOf(filesFlag) >= 0 ? process.argv[process.argv.indexOf(filesFlag) + 1] : '*.js.map';
    const directory = process.argv.indexOf(directoryFlag) >= 0 ? process.argv[process.argv.indexOf(directoryFlag) + 1] : '.';
    const globPattern = `${directory}/${files}`;

    try {
        const paths = await glob(globPattern);

        if (!paths.length) {
            throw new Error(`Could not find any files to upload using glob ${globPattern}!`);
        }

        console.log(`Found files:\n ${paths}`);
        console.log(`About to log into BugSplat with user ${email}...`);

        const bugsplat = new BugSplatApiClient();
        await bugsplat.login(email, password);

        console.log('Login successful!');
        console.log(`About to upload symbols for ${database}-${application}-${version}...`);

        const files = paths.map(path => {
            const stat = fs.statSync(path);
            const size = stat.size;
            const name = basename(path);
            return {
                name,
                size,
                file: fs.createReadStream(path)
            };
        });

        const symbolsApiClient = new SymbolsApiClient(bugsplat);
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

function helpAndExit() {
    const help = '\n'
        + '@bugsplat/symbol-upload contains a command line utility and set of libraries to help you upload symbols to BugSplat.'
        + '\n\n\n'
        + 'symbol-upload command line usage:'
        + '\n\n\n'
        + '\tnode ./symbol-upload -database Fred -application my-ts-crasher -version 1.0.0 [ -email fred@bugsplat.com -password ****** -files "*.js.map" -directory "/path/to/containing/dir" ]'
        + '\n\n\n'
        + 'The -email and -password arguments are optional if you set the environment variables SYMBOL_UPLOAD_EMAIL and SYMBOL_UPLOAD_PASSWORD respectively. '
        + '\n\n'
        + 'The -files and -directory arguments are optional and will default to "*.js.map" and "." respectively.'
        + '\n\n\n'
        + '❤️ support@bugsplat.com';

    console.log(help);
    process.exit(1);
}

function missingArg(arg: string) {
    console.log(`\nMissing argument: -${arg}\n`);
    process.exit(1);
}
