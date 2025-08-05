#! /usr/bin/env node
import {
  ApiClient,
  BugSplatApiClient,
  OAuthClientCredentialsClient,
  VersionsApiClient,
} from '@bugsplat/js-api-client';
import commandLineArgs, { CommandLineOptions } from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import { glob } from 'glob';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileExists } from '../src/fs';
import { importNodeDumpSyms } from '../src/preload';
import { getNormalizedSymFileName } from '../src/sym';
import { safeRemoveTmp, tmpDir } from '../src/tmp';
import { uploadSymbolFiles } from '../src/upload';
import {
  CommandLineDefinition,
  argDefinitions,
  usageDefinitions,
} from './command-line-definitions';
import firstline from 'firstline';
import type { dumpSyms } from 'node-dump-syms';

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
    dumpSyms: shouldRunDumpSyms,
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
      clientSecret,
    })
  ) {
    logMissingAuthAndExit();
  }

  console.log('About to authenticate...');

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

      console.log(
        `About to delete symbols for ${database}-${application}-${version}...`
      );

      await versionsApiClient.deleteSymbols(database, application, version);

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

  let foundFilePaths = await glob(globPattern);

  if (!foundFilePaths.length) {
    throw new Error(
      `Could not find any files to upload using glob ${globPattern}!`
    );
  }

  console.log(`Found files:\n ${foundFilePaths.join('\n')}`);

  if (shouldRunDumpSyms) {
    let nodeDumpSyms: typeof dumpSyms;

    try {
      nodeDumpSyms = (await importNodeDumpSyms()).dumpSyms;
    } catch (cause) {
      throw new Error(
        "Can't import dump_syms! Please ensure node-dump-syms is installed https://github.com/BugSplat-Git/node-dump-syms",
        { cause }
      );
    }

    const newSymFilePaths: Array<string> = [];

    for (const file of foundFilePaths) {
      newSymFilePaths.push(await runDumpSyms(nodeDumpSyms, file));
    }
  }

  await uploadSymbolFiles(
    bugsplat,
    database,
    application,
    version,
    foundFilePaths
  );
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
  clientSecret,
}: AuthenticationArgs): Promise<ApiClient> {
  const host = process.env.BUGSPLAT_HOST;

  if (user && password) {
    return BugSplatApiClient.createAuthenticatedClientForNode(
      user,
      password,
      host
    );
  }

  return OAuthClientCredentialsClient.createAuthenticatedClient(
    clientId,
    clientSecret,
    host
  );
}

async function getCommandLineOptions(
  argDefinitions: Array<CommandLineDefinition>
): Promise<CommandLineOptions> {
  const options = commandLineArgs(argDefinitions);
  let { database, application, version } = options;
  let packageJson;

  if (!database || !application || !version) {
    const packageJsonPath = './package.json';
    packageJson = (await fileExists(packageJsonPath))
      ? JSON.parse((await readFile(packageJsonPath)).toString())
      : null;
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
    version,
  };
}

function logHelpAndExit() {
  const help = commandLineUsage(usageDefinitions);
  console.log(help);
  process.exit(1);
}

function logMissingArgAndExit(arg: string): void {
  console.log(`\nMissing argument: -${arg}\n`);
  logHelpAndExit();
}

function logMissingAuthAndExit(): void {
  console.log(
    '\nInvalid authentication arguments: please provide either a user and password, or a clientId and clientSecret\n'
  );
  logHelpAndExit();
}

function normalizeDirectory(directory: string): string {
  return directory.replace(/\\/g, '/');
}

async function runDumpSyms(
  nodeDumpSyms: typeof dumpSyms,
  inputFilePath: string
) {
  console.log(`Dumping syms for ${inputFilePath}...`);

  const uuid = randomUUID();
  const tmpSymFile = join(tmpDir, randomUUID(), `${uuid}.sym`);

  mkdirSync(dirname(tmpSymFile), { recursive: true });
  nodeDumpSyms(inputFilePath, tmpSymFile);

  const symFirstLine = await firstline(tmpSymFile);
  const moduleName = 'todo bg';
  const outputFilePath = 'todo bg';

  return outputFilePath;
}

function validAuthenticationArguments({
  user,
  password,
  clientId,
  clientSecret,
}: AuthenticationArgs): boolean {
  return !!(user && password) || !!(clientId && clientSecret);
}

interface AuthenticationArgs {
  user: string;
  password: string;
  clientId: string;
  clientSecret: string;
}
