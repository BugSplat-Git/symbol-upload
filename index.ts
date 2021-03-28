import { glob } from 'glob';
import { BugSplatApiClient } from './src/bugsplat-api-client';
import { Symbols } from './src/symbols';

if (
    process.argv.some(arg => arg === '-h')
    || process.argv.some(arg => arg === '/h')
    || process.argv.some(arg => arg === '-help')
    || process.argv.some(arg => arg === '/help')
    || process.argv.length <= 1
) {
    helpAndExit();
}

const emailArg = process.argv.find(arg => arg === '-email');
if (!emailArg) {
    helpAndExit('email');
}

const passwordArg = process.argv.find(arg => arg === '-password');
if (!passwordArg) {
    helpAndExit('password');
}

const databaseArg = process.argv.find(arg => arg === '-database');
if (!databaseArg) {
    helpAndExit('database');
}

const applicationArg = process.argv.find(arg => arg === '-application');
if (!applicationArg) {
    helpAndExit('application');
}

const versionArg = process.argv.find(arg => arg === '-version');
if (!versionArg) {
    helpAndExit('version');
}

const filesArg = process.argv.find(arg => arg === '-files');
if (!filesArg) {
    helpAndExit('files');
}

const directoryArg = process.argv.find(arg => arg === '-directory');

const email = process.argv[process.argv.indexOf(<string>emailArg) + 1];
const password = process.argv[process.argv.indexOf(<string>passwordArg) + 1];
const database = process.argv[process.argv.indexOf(<string>databaseArg) + 1];
const application = process.argv[process.argv.indexOf(<string>applicationArg) + 1];
const version = process.argv[process.argv.indexOf(<string>versionArg) + 1];
const fileSpec = process.argv[process.argv.indexOf(<string>filesArg) + 1];
const directory = process.argv.indexOf(<string>directoryArg) >= 0 ? process.argv[process.argv.indexOf(<string>directoryArg) + 1] : './';

glob(`${directory}/${fileSpec}`, async (err, files) => {
    if (err) {
        throw err;
    }

    if (!files.length) {
        throw new Error('Could not find any files to upload!');
    }

    console.log(`Found files:\n ${files}`);
    console.log(`About to log into BugSplat with user ${email}...`);
    const client = new BugSplatApiClient(`http://${database}.bugsplat.com`); // TODO BG https
    await client.login(email, password);
    console.log('Login successful!')
    console.log(`About to upload symbols for application ${application}-${version} to database ${database}...`);
    const symbols = new Symbols(
        database,
        application,
        version,
        files,
        client
    );
    await symbols.post();
    console.log('Symbols uploaded successfully!');
});

function helpAndExit(missingArg: string = '') {
    const help = '\n\n'
        + 'symbol-upload usage:'
        + '\n\n\n'
        + '\tnode ./symbol-upload -email fred@bugsplat.com -password ****** -database Fred -application my-ts-crasher -version 1.0.0 -files "*.js.map" [ -directory "/path/to/containing/dir" ]'
        + '\n\n\n'
        + '❤️ support@bugsplat.com'
        + '\n';

    if (missingArg) {
        console.log(`\nMissing argument: -${missingArg}`)
    }

    console.log(help);
    process.exit();
}