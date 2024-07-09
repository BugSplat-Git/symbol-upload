import { OptionDefinition as ArgDefinition } from "command-line-args";
import { Section, OptionDefinition as UsageDefinition } from "command-line-usage";
import { existsSync, readFileSync } from "fs";
import { join } from "node:path";
import { getAsset, isSea } from "node:sea";

const packageVersion = getPackageVersion();

export type CommandLineDefinition = ArgDefinition & UsageDefinition;

export const argDefinitions: Array<CommandLineDefinition> = [
    {
        name: 'help',
        alias: 'h',
        type: Boolean,
        description: 'Print this usage guide.'
    },
    {
        name: 'database',
        alias: 'b',
        type: String,
        typeLabel: '{underline string}',
        description: 'Your BugSplat database name. The value of database must match the value used to post crash reports. This value can also be provided via the BUGSPLAT_DATABASE environment variable.'
    },
    {
        name: 'application',
        alias: 'a',
        type: String,
        typeLabel: '{underline string}',
        description: 'The name of your application. If not provided symbol-upload will attempt to use the value of the name field in package.json if it exists in the current working directory.',
    },
    {
        name: 'version',
        alias: 'v',
        type: String,
        typeLabel: '{underline string}',
        description: 'Your application\'s version. If not provided symbol-upload will attempt to use the value of the version field in package.json if it exists in the current working directory.',
    },
    {
        name: 'user',
        alias: 'u',
        type: String,
        typeLabel: '{underline string} (optional)',
        description: 'The email address used to log into your BugSplat account. If provided --password must also be provided. This value can also be provided via the SYMBOL_UPLOAD_USER environment variable.',
    },
    {
        name: 'password',
        alias: 'p',
        type: String,
        typeLabel: '{underline string} (optional)',
        description: 'The password for your BugSplat account. If provided --user must also be provided. This value can also be provided via the SYMBOL_UPLOAD_PASSWORD environment variable.',
    },
    {
        name: 'clientId',
        alias: 'i',
        type: String,
        typeLabel: '{underline string} (optional)',
        description: 'An OAuth2 Client Credentials Client ID for the specified database. If provided --clientSecret must also be provided. This value can also be provided via the SYMBOL_UPLOAD_CLIENT_ID environment variable.',
    },
    {
        name: 'clientSecret',
        alias: 's',
        type: String,
        typeLabel: '{underline string} (optional)',
        description: 'An OAuth2 Client Credentials Client Secret for the specified database. If provided --clientId must also be provided. This value can also be provided via the SYMBOL_UPLOAD_CLIENT_SECRET environment variable.',
    },
    {
        name: 'remove',
        alias: 'r',
        type: Boolean,
        description: 'Removes symbols for a specified database, application, and version. If this option is provided no other actions are taken.'
    },
    {
        name: 'files',
        alias: 'f',
        type: String,
        defaultValue: '*.js.map',
        typeLabel: '{underline string} (optional)',
        description: 'Glob pattern that specifies a set of files to upload. For example, **/*.\\{pdb,exe,dll\\} will recursively search for .pdb, .exe, and .dll files. Defaults to \'*.js.map\'',
    },
    {
        name: 'directory',
        alias: 'd',
        type: String,
        defaultValue: '.',
        typeLabel: '{underline string} (optional)',
        description: 'Path of the base directory used to search for symbol files. This value will be combined with the --files glob. Defaults to \'.\'',
    },
    {
        name: 'dumpSyms',
        alias: 'm',
        type: Boolean,
        defaultValue: false,
        description: 'Use dump_syms to generate and upload sym files for specified binaries.',
        typeLabel: '{underline boolean} (optional)',
    }
];

export const usageDefinitions: Array<Section> = [
    {
        header: `@bugsplat/symbol-upload v${packageVersion}`,
        content: 'symbol-upload contains a command line utility and a set of libraries to help you upload symbol files to BugSplat.',
    },
    {
        header: 'Usage',
        optionList: argDefinitions
    },
    {
        content: [
            'The -u and -p arguments are not required if you set the environment variables SYMBOL_UPLOAD_USER and SYMBOL_UPLOAD_PASSWORD, or provide a clientId and clientSecret.',
            '',
            'The -i and -s arguments are not required if you set the environment variables SYMBOL_UPLOAD_CLIENT_ID and SYMBOL_UPLOAD_CLIENT_SECRET, or provide a user and password.'
        ]
    },
    {
        header: 'Example',
        content: [
            'symbol-upload -b {italic your-bugsplat-database} -a {italic your-application-name} -v {italic your-version} [ -f "*.js.map" -d "/path/to/containing/dir" [ -u {italic your-bugsplat-email} -p {italic your-bugsplat-password} ] OR [ -i {italic your-client-id} -s {italic your-client-secret}] ]',
        ]
    },
    {
        header: 'Links',
        content:
            [
                '🐛 {underline https://bugsplat.com}',
                '',
                '💻 {underline https://github.com/BugSplat-Git/symbol-upload}',
                '',
                '💌 {underline support@bugsplat.com}'
            ]
    }
];

function getPackageVersion(): string {
    if (isSea()) {
        return JSON.parse(`${getAsset('package.json', 'utf-8')}`).version;
    }

    const path = [
        join(__dirname, 'package.json'),
        join(__dirname, '../package.json'),
        join(__dirname, '../../package.json'),
    ].find((path) => existsSync(path));

    if (!path) {
        throw new Error('Could not find package.json');
    }

    const packageJson = readFileSync(path, 'utf-8').toString();

    try {
        return JSON.parse(packageJson).version;
    } catch {
        throw new Error('Could not parse package.json');
    }
}