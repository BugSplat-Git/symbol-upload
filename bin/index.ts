#! /usr/bin/env node
import { ApiClient, VersionsApiClient } from '@bugsplat/js-api-client';
import commandLineArgs, { CommandLineOptions } from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import { glob } from 'glob';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { AuthenticationArgs, createBugSplatClient } from '../src/auth';
import { fileExists } from '../src/fs';
import {
  createSymbolFileInfos,
  filterSymbolFilePaths,
  SymbolFileInfo,
} from '../src/info';
import { importNodeDumpSyms } from '../src/preload';
import { getNormalizedSymFileName } from '../src/sym';
import { safeRemoveTmp, tmpDir } from '../src/tmp';
import { terminateWorkerPool, uploadSymbolFiles } from '../src/upload';
import {
  argDefinitions,
  CommandLineDefinition,
  usageDefinitions,
} from './command-line-definitions';

(async () => {
  let {
    help,
    database,
    application,
    version,
    clientId,
    clientSecret,
    remove,
    files,
    directory,
    dumpSyms,
    localPath,
  } = await getCommandLineOptions(argDefinitions);

  if (help) {
    logHelp();
    return;
  }

  database = database ?? process.env.BUGSPLAT_DATABASE;
  clientId = clientId ?? process.env.SYMBOL_UPLOAD_CLIENT_ID;
  clientSecret = clientSecret ?? process.env.SYMBOL_UPLOAD_CLIENT_SECRET;

  if (!database && !localPath) {
    logMissingArg('database');
    return;
  }

  if (!application && !localPath) {
    logMissingArg('application');
    return;
  }

  if (!version && !localPath) {
    logMissingArg('version');
    return;
  }

  if (
    !localPath &&
    !validAuthenticationArguments({
      clientId,
      clientSecret,
    })
  ) {
    logMissingAuth();
    return;
  }

  console.log(`Symbol upload working directory: ${process.cwd()}`);

  let bugsplat: ApiClient | null = null;

  if (!localPath) {
    console.log('About to authenticate...');

    bugsplat = await createBugSplatClient({
      clientId,
      clientSecret,
    });

    console.log('Authentication success!');
  }

  if (remove && bugsplat) {
    try {
      const versionsApiClient = new VersionsApiClient(bugsplat);

      console.log(
        `About to delete symbols for ${database}-${application}-${version}...`
      );

      await versionsApiClient.deleteSymbols(database, application, version);

      console.log('Symbols deleted successfully!');
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      return;
    }
  }

  directory = normalizeDirectory(directory);

  if (!existsSync(tmpDir)) {
    await mkdir(tmpDir);
  }

  const globPattern = `${directory}/${files}`;

  let symbolFilePaths = await filterSymbolFilePaths(await glob(globPattern));

  if (!symbolFilePaths.length) {
    throw new Error(
      `Could not find any files to upload using glob ${globPattern}!`
    );
  }

  console.log(`Found files:\n ${symbolFilePaths.join('\n')}`);

  if (dumpSyms) {
    let nodeDumpSyms;

    try {
      nodeDumpSyms = (await importNodeDumpSyms()).dumpSyms;
    } catch (cause) {
      throw new Error(
        "Can't import dump_syms! Please ensure node-dump-syms is installed https://github.com/BugSplat-Git/node-dump-syms",
        { cause }
      );
    }

    const newSymbolFilePaths: string[] = [];

    for (const file of symbolFilePaths) {
      console.log(`Dumping syms for ${file}...`);
      
      const symFile = join(
        tmpDir,
        randomUUID(),
        getNormalizedSymFileName(basename(file))
      );

      mkdirSync(dirname(symFile), { recursive: true });

      try {
        nodeDumpSyms(file, symFile);
      } catch (error: any) {
        console.warn(`Failed to dump syms for ${file}: ${error?.message || error}`);
        continue;
      }

      newSymbolFilePaths.push(symFile);
    }

    symbolFilePaths = newSymbolFilePaths;
  }

  if (!symbolFilePaths.length) {
    throw new Error('No valid symbol files found!');
  }

  const symbolFileInfos = await Promise.all(
    symbolFilePaths.map(
      async (symbolFilePath) => await createSymbolFileInfos(symbolFilePath)
    )
  ).then((array) => array.flat());

  if (localPath) {
    await copyFilesToLocalPath(symbolFileInfos, localPath);
  } 
  
  if (bugsplat) {
    await uploadSymbolFiles(
      bugsplat,
      database,
      application,
      version,
      symbolFileInfos
    );
  }
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  // Stop the workers before removing tmpDir. A rejected upload leaves sibling workers mid-gzip, and
  // deleting the directory out from under them means noisy worker failures and file locks on Windows.
  .finally(async () => {
    await terminateWorkerPool();
    await safeRemoveTmp();
  });

async function copyFilesToLocalPath(
  symbolFileInfos: SymbolFileInfo[],
  localPath: string
): Promise<void> {
  console.log(`Copying files to ${localPath}...`);
  
  for (const symbolFileInfo of symbolFileInfos) {
    if (!symbolFileInfo.dbgId) {
      console.warn(`Failed to parse UUID for ${symbolFileInfo.path}, skipping...`);
      continue;
    }

    const localFilePath = join(
      localPath,
      symbolFileInfo.moduleName,
      symbolFileInfo.dbgId,
      basename(symbolFileInfo.path)
    );
    mkdirSync(dirname(localFilePath), { recursive: true });
    await copyFile(symbolFileInfo.path, localFilePath);
  }

  const symSrvMarkerFilePath = join(localPath, 'index.txt');
  await writeFile(symSrvMarkerFilePath, '.');
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

function logHelp(): void {
  const help = commandLineUsage(usageDefinitions);
  console.log(help);
}

function logMissingArg(arg: string): void {
  console.log(`\nMissing argument: -${arg}\n`);
  logHelp();
  process.exitCode = 1;
}

function logMissingAuth(): void {
  console.log(
    '\nInvalid authentication arguments: please provide a clientId and clientSecret\n'
  );
  logHelp();
  process.exitCode = 1;
}

function normalizeDirectory(directory: string): string {
  return directory.replace(/\\/g, '/');
}

function validAuthenticationArguments({
  clientId,
  clientSecret,
}: AuthenticationArgs): boolean {
  return !!(clientId && clientSecret);
}
