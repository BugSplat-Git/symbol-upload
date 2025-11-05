import {
  ApiClient,
  BugSplatApiClient,
  OAuthClientCredentialsClient,
  VersionsApiClient,
} from '@bugsplat/js-api-client';
import { glob } from 'glob';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileExists } from '../src/fs.js';
import { createSymbolFileInfos, SymbolFileInfo } from '../src/info.js';
import { importNodeDumpSyms } from '../src/preload.js';
import { getNormalizedSymFileName } from '../src/sym.js';
import { safeRemoveTmp, tmpDir } from '../src/tmp.js';
import { uploadSymbolFiles } from '../src/upload.js';
import { getEnv, getCwd } from '../src/compat.js';

export interface CliOptions {
  help?: boolean;
  database?: string;
  application?: string;
  version?: string;
  user?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  remove?: boolean;
  files?: string;
  directory?: string;
  dumpSyms?: boolean;
  localPath?: string;
}

export interface AuthenticationArgs {
  user?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
}

export async function runSymbolUpload(options: CliOptions): Promise<void> {
  let {
    database,
    application,
    version,
    user,
    password,
    clientId,
    clientSecret,
    remove,
    files = '*.js.map',
    directory = '.',
    dumpSyms,
    localPath,
  } = options;

  // Get values from environment if not provided
  database = database ?? getEnv('BUGSPLAT_DATABASE');
  user = user ?? getEnv('SYMBOL_UPLOAD_USER');
  password = password ?? getEnv('SYMBOL_UPLOAD_PASSWORD');
  clientId = clientId ?? getEnv('SYMBOL_UPLOAD_CLIENT_ID');
  clientSecret = clientSecret ?? getEnv('SYMBOL_UPLOAD_CLIENT_SECRET');

  if (!database && !localPath) {
    throw new Error('Missing required argument: database');
  }

  if (!application && !localPath) {
    throw new Error('Missing required argument: application');
  }

  if (!version && !localPath) {
    throw new Error('Missing required argument: version');
  }

  if (
    !localPath &&
    !validAuthenticationArguments({
      user,
      password,
      clientId,
      clientSecret,
    })
  ) {
    throw new Error(
      'Invalid authentication arguments: please provide either a user and password, or a clientId and clientSecret'
    );
  }

  const cwd = getCwd();
  console.log(`Symbol upload working directory: ${cwd}`);

  let bugsplat: ApiClient | null = null;

  if (!localPath) {
    console.log('About to authenticate...');

    const host = getEnv('BUGSPLAT_HOST');

    bugsplat = await createBugSplatClient({
      user,
      password,
      clientId,
      clientSecret,
      host,
    });

    console.log('Authentication success!');
  }

  if (remove && bugsplat && database && application && version) {
    try {
      const versionsApiClient = new VersionsApiClient(bugsplat);

      console.log(
        `About to delete symbols for ${database}-${application}-${version}...`
      );

      await versionsApiClient.deleteSymbols(database, application, version);

      console.log('Symbols deleted successfully!');
      return;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  directory = normalizeDirectory(directory);

  if (!existsSync(tmpDir)) {
    await mkdir(tmpDir);
  }

  const globPattern = `${directory}/${files}`;

  let symbolFilePaths = await glob(globPattern);

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
        { cause: cause as Error }
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
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to dump syms for ${file}: ${errorMessage}`);
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
  
  if (bugsplat && database && application && version) {
    await uploadSymbolFiles(
      bugsplat,
      database,
      application,
      version,
      symbolFileInfos
    );
  }

  await safeRemoveTmp();
}

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

async function createBugSplatClient({
  user,
  password,
  clientId,
  clientSecret,
  host,
}: AuthenticationArgs & { host?: string }): Promise<ApiClient> {
  if (user && password) {
    return await BugSplatApiClient.createAuthenticatedClientForNode(
      user,
      password,
      host
    );
  }

  return await OAuthClientCredentialsClient.createAuthenticatedClient(
    clientId!,
    clientSecret!,
    host
  );
}

function normalizeDirectory(directory: string): string {
  return directory.replace(/\\/g, '/');
}

function validAuthenticationArguments({
  user,
  password,
  clientId,
  clientSecret,
}: AuthenticationArgs): boolean {
  return !!(user && password) || !!(clientId && clientSecret);
}

export async function getPackageVersion(): Promise<string> {
  const packageJsonPath = './package.json';
  
  if (await fileExists(packageJsonPath)) {
    const packageJson = JSON.parse((await readFile(packageJsonPath)).toString());
    return packageJson.version || 'unknown';
  }
  
  return 'unknown';
}

export async function getPackageJson(): Promise<{ database?: string; name?: string; version?: string } | null> {
  const packageJsonPath = './package.json';
  
  if (await fileExists(packageJsonPath)) {
    return JSON.parse((await readFile(packageJsonPath)).toString());
  }
  
  return null;
}

