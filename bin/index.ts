import commandLineArgs, { CommandLineOptions } from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import { readFile } from 'node:fs/promises';
import { safeRemoveTmp } from '../src/tmp.js';
import { fileExists } from '../src/fs.js';
import { runSymbolUpload, getPackageJson, type CliOptions } from './lib.js';
import {
  argDefinitions,
  CommandLineDefinition,
  usageDefinitions,
} from './command-line-definitions.js';

(async () => {
  let options = getCommandLineOptions(argDefinitions);

  if (options.help) {
    logHelpAndExit();
  }

  // Fill in missing values from package.json
  const packageJson = await getPackageJson();
  options = {
    ...options,
    database: options.database ?? packageJson?.database,
    application: options.application ?? packageJson?.name,
    version: options.version ?? packageJson?.version,
  };

  await runSymbolUpload(options);
  process.exit(0);
})().catch(async (error) => {
  await safeRemoveTmp();
  console.error(error.message);
  process.exit(1);
});

function getCommandLineOptions(
  argDefinitions: Array<CommandLineDefinition>
): CommandLineOptions {
  return commandLineArgs(argDefinitions);
}

function logHelpAndExit(code: number = 0) {
  const help = commandLineUsage(usageDefinitions);
  console.log(help);
  process.exit(code);
}
