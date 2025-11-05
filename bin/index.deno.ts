import { runSymbolUpload, getPackageJson, getPackageVersion, type CliOptions } from './lib.js';
import { safeRemoveTmp } from '../src/tmp.js';
import { argDefinitionsPlain } from './command-line-definitions.js';

// ANSI escape codes for formatting (Deno-compatible)
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  underline: '\x1b[4m',
  italic: '\x1b[3m',
};

function formatText(text: string): string {
  // Replace {bold text} with bold ANSI
  text = text.replace(/\{bold\s+([^}]+)\}/g, (_, content) => `${ANSI.bold}${content}${ANSI.reset}`);
  // Replace {underline text} with underline ANSI
  text = text.replace(/\{underline\s+([^}]+)\}/g, (_, content) => `${ANSI.underline}${content}${ANSI.reset}`);
  // Replace {italic text} with italic ANSI
  text = text.replace(/\{italic\s+([^}]+)\}/g, (_, content) => `${ANSI.italic}${content}${ANSI.reset}`);
  return text;
}

async function printHelp() {
  const packageVersion = await getPackageVersion();
  
  console.log(`${ANSI.bold}@bugsplat/symbol-upload v${packageVersion}${ANSI.reset}`);
  console.log('symbol-upload contains a command line utility and a set of libraries to help you upload symbol files to BugSplat.\n');
  console.log(`${ANSI.bold}Usage${ANSI.reset}`);
  console.log('  symbol-upload [options]\n');
  console.log(`${ANSI.bold}Options${ANSI.reset}`);
  
  // Loop through argDefinitionsPlain to generate help text
  for (const def of argDefinitionsPlain) {
    const aliasPart = def.alias ? `-${def.alias}, ` : '    ';
    const namePart = `--${def.name}`;
    const typeLabel = def.typeLabel ? ` ${formatText(def.typeLabel)}` : '';
    const defaultValue = def.defaultValue !== undefined && def.defaultValue !== '' && def.defaultValue !== false
      ? ` (default: ${def.defaultValue})`
      : '';
    
    // Format similar to command-line-usage output
    const optionLine = `  ${aliasPart}${namePart}${typeLabel}${defaultValue}`;
    console.log(optionLine);
    // Indent description
    const description = formatText(def.description);
    // Wrap long descriptions
    const maxWidth = 70;
    const words = description.split(' ');
    let line = '      ';
    for (const word of words) {
      if ((line + word).length > maxWidth) {
        console.log(line);
        line = '      ' + word + ' ';
      } else {
        line += word + ' ';
      }
    }
    if (line.trim() !== '') {
      console.log(line);
    }
    console.log('');
  }
  
  console.log(`${ANSI.bold}Example${ANSI.reset}`);
  console.log(`  symbol-upload -b ${ANSI.italic}your-bugsplat-database${ANSI.reset} -a ${ANSI.italic}your-application-name${ANSI.reset} -v ${ANSI.italic}your-version${ANSI.reset} [ -f "*.js.map" -d "/path/to/containing/dir" [ -u ${ANSI.italic}your-bugsplat-email${ANSI.reset} -p ${ANSI.italic}your-bugsplat-password${ANSI.reset} ] OR [ -i ${ANSI.italic}your-client-id${ANSI.reset} -s ${ANSI.italic}your-client-secret${ANSI.reset}] ]`);
  console.log('');
  console.log('The -u and -p arguments are not required if you set the environment variables SYMBOL_UPLOAD_USER and SYMBOL_UPLOAD_PASSWORD, or provide a clientId and clientSecret.');
  console.log('');
  console.log('The -i and -s arguments are not required if you set the environment variables SYMBOL_UPLOAD_CLIENT_ID and SYMBOL_UPLOAD_CLIENT_SECRET, or provide a user and password.');
  console.log('');
  console.log(`${ANSI.bold}Links${ANSI.reset}`);
  console.log(`  🐛 ${ANSI.underline}https://bugsplat.com${ANSI.reset}`);
  console.log(`  💻 ${ANSI.underline}https://github.com/BugSplat-Git/symbol-upload${ANSI.reset}`);
  console.log(`  💌 ${ANSI.underline}support@bugsplat.com${ANSI.reset}`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    
    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-b':
      case '--database':
        options.database = args[++i];
        break;
      case '-a':
      case '--application':
        options.application = args[++i];
        break;
      case '-v':
      case '--version':
        options.version = args[++i];
        break;
      case '-u':
      case '--user':
        options.user = args[++i];
        break;
      case '-p':
      case '--password':
        options.password = args[++i];
        break;
      case '-i':
      case '--clientId':
        options.clientId = args[++i];
        break;
      case '-s':
      case '--clientSecret':
        options.clientSecret = args[++i];
        break;
      case '-r':
      case '--remove':
        options.remove = true;
        break;
      case '-f':
      case '--files':
        options.files = args[++i];
        break;
      case '-d':
      case '--directory':
        options.directory = args[++i];
        break;
      case '-m':
      case '--dumpSyms':
        options.dumpSyms = true;
        break;
      case '-l':
      case '--localPath':
        options.localPath = args[++i];
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        console.error('Use --help to see available options');
        Deno.exit(1);
    }
    i++;
  }

  return options;
}

try {
  const args = Deno.args;
  let options = parseArgs(args);

  if (options.help) {
    await printHelp();
    Deno.exit(0);
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
  Deno.exit(0);
} catch (error) {
  await safeRemoveTmp();
  console.error(error instanceof Error ? error.message : String(error));
  Deno.exit(1);
}
