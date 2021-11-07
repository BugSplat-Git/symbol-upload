import { OptionDefinition as ArgDefinition } from "command-line-args";
import { OptionDefinition as UsageDefinition, Section } from "command-line-usage";

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
        description: 'Your BugSplat database name.'
    },
    {
        name: 'application',
        alias: 'a',
        type: String,
        typeLabel: '{underline string}',
        description: 'The name of your application used to post crash reports',
    },
    {
        name: 'version',
        alias: 'v',
        type: String,
        typeLabel: '{underline string}',
        description: 'The version of your application used to post crash reports',
    },
    {
        name: 'user',
        alias: 'u',
        type: String,
        typeLabel: '{underline string} (optional)',
        description: 'The email address of your BugSplat account. Can also be provided via the SYMBOL_UPLOAD_USER environment variable. If provided --password must also be provided.',
    },
    {
        name: 'password',
        alias: 'p',
        type: String,
        typeLabel: '{underline string} (optional)',
        description: 'The password for your BugSplat account. Can also be provided via the SYMBOL_UPLOAD_PASSWORD environment variable. If provided --user must also be provided.',
    },
    {
        name: 'clientId',
        alias: 'i',
        type: String,
        typeLabel: '{underline string} (optional)',
        description: 'An OAuth2 Client Credentials Client ID for the specified database. Can also be provided via the SYMBOL_UPLOAD_CLIENT_ID environment variable. If provided --clientSecret must also be provided.',
    },
    {
        name: 'clientSecret',
        alias: 's',
        type: String,
        typeLabel: '{underline string} (optional)',
        description: 'An OAuth2 Client Credentials Client Secret for the specified database. Can also be provided via the SYMBOL_UPLOAD_CLIENT_SECRET environment variable. If provided --clientId must also be provided.',
    },
    {
        name: 'remove',
        alias: 'r',
        type: Boolean,
        description: 'Removes symbols for specified database, application, version, and exits.'
    },
    {
        name: 'files',
        alias: 'f',
        type: String,
        defaultValue: '*.js.map',
        typeLabel: '{underline string} (optional)',
        description: 'Glob pattern specifying a file pattern to upload. Defaults to \'*.js.map\'',
    },
    {
        name: 'directory',
        alias: 'd',
        type: String,
        defaultValue: '.',
        typeLabel: '{underline string} (optional)',
        description: 'Path to base directory to search for symbols and will be combined with the -f glob. Defaults to \'.\'',
    }
];

export const usageDefinitions: Array<Section> = [
    {
        header: '@bugsplat/symbol-upload',
        content: '@bugsplat/symbol-upload contains a command line utility and set of libraries to help you upload symbols to BugSplat.',
    },
    {
        header: 'Usage',
        content: 'symbol-upload -b {your-bugsplat-database} -a {your-application-name} -v {your-version} [ -f "*.js.map" -d "/path/to/containing/dir" [ -u {your-bugsplat-email} -p {your-bugsplat-password} ] OR [ -i {your-client-id} -s {your-client-secret} ] ]',
        optionList: argDefinitions
    },
    {
        content: 'The -u and -p arguments are optional if you set the environment variables SYMBOL_UPLOAD_USER and SYMBOL_UPLOAD_PASSWORD, or provide a Client ID and Client Secret pair.'
    },
    {
        content: 'The -i and -s arguments are optional if you set the environment variables SYMBOL_UPLOAD_CLIENT_ID and SYMBOL_UPLOAD_CLIENT_SECRET, or provide a user and password.'
    },
    {
        content: '{underline https://github.com/BugSplat-Git/symbol-upload}'
    },
    {
        content: '❤️ support@bugsplat.com'
    }
];