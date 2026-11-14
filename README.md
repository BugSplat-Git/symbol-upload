[![bugsplat-github-banner-basic-outline](https://user-images.githubusercontent.com/20464226/149019306-3186103c-5315-4dad-a499-4fd1df408475.png)](https://bugsplat.com)
<br/>
# <div align="center">BugSplat</div> 
### **<div align="center">Crash and error reporting built for busy developers.</div>**
<div align="center">
    <a href="https://twitter.com/BugSplatCo">
        <img alt="Follow @bugsplatco on Twitter" src="https://img.shields.io/twitter/follow/bugsplatco?label=Follow%20BugSplat&style=social">
    </a>
    <a href="https://discord.gg/bugsplat">
        <img alt="Join BugSplat on Discord" src="https://img.shields.io/discord/664965194799251487?label=Join%20Discord&logo=Discord&style=social">
    </a>
</div>

<br/>

# symbol-upload

This repo is a simple Node.js utility, set of libraries, and GitHub action for uploading symbol files or source maps to [BugSplat](https://www.bugsplat.com). This utility is designed to be used in your build process to upload symbols to BugSplat automatically for each production build. This package can be used as a library or a command line utility.

## Action

Use the `symbol-upload` action in your [GitHub Actions](https://github.com/features/actions) workflow by modifying the following snippet.

```yml
- name: Symbols 📦
  uses: BugSplat-Git/symbol-upload@v11
  with:
    clientId: "${{ secrets.SYMBOL_UPLOAD_CLIENT_ID }}"
    clientSecret: "${{ secrets.SYMBOL_UPLOAD_CLIENT_SECRET }}"
    database: "${{ secrets.BUGSPLAT_DATABASE }}"
    application: "your-application"
    version: "your-version"
    files: "**/*.{pdb,exe,dll}"
    directory: "your-build-directory"
    node-version: "24"
    dumpSyms: false
```

Be sure to use [secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions) so that you don't expose the values for `clientId`, `clientSecret`, and `database`.

Pin `@v11` to track the latest 11.x release, or an exact tag like `@v11.0.0`. The action installs the `@bugsplat/symbol-upload` npm package version matching the pinned ref; SHA and branch refs install the version recorded in that commit's `package.json`. Set `symbol-upload-version` to override.

## Command Line

Install this `symbol-upload` globally using npm.

```bash
npm i -g @bugsplat/symbol-upload
```

Alternatively, you can download a binary version using the terminal.

macos
```sh
curl -sL -O "https://app.bugsplat.com/download/symbol-upload-macos" && chmod +x symbol-upload-macos
```

windows
```ps1
Invoke-WebRequest -Uri "https://app.bugsplat.com/download/symbol-upload-windows.exe" -OutFile "symbol-upload-windows.exe"
```

linux
```sh
curl -sL -O  "https://app.bugsplat.com/download/symbol-upload-linux" && chmod +x symbol-upload-linux
```

Run `symbol-upload` with `-h` to see the latest usage information and package version:

```bash
bobby@BugSplat % ~ % symbol-upload -h

@bugsplat/symbol-upload v10.5.2

  symbol-upload contains a command line utility and a set of libraries to help  
  you upload symbol files to BugSplat.                                          

Usage

  -h, --help                          Print this usage guide.                   
  -b, --database string               Your BugSplat database name. The value of 
                                      database must match the value used to     
                                      post crash reports. This value can also   
                                      be provided via the BUGSPLAT_DATABASE     
                                      environment variable.                     
  -a, --application string            The name of your application. If not      
                                      provided symbol-upload will attempt to    
                                      use the value of the name field in        
                                      package.json if it exists in the current  
                                      working directory.                        
  -v, --version string                Your application's version. If not        
                                      provided symbol-upload will attempt to    
                                      use the value of the version field in     
                                      package.json if it exists in the current  
                                      working directory.                        
  -i, --clientId string               An OAuth2 Client Credentials Client ID    
                                      for the specified database. If provided   
                                      --clientSecret must also be provided.     
                                      This value can also be provided via the   
                                      SYMBOL_UPLOAD_CLIENT_ID environment       
                                      variable.                                 
  -s, --clientSecret string           An OAuth2 Client Credentials Client       
                                      Secret for the specified database. If     
                                      provided --clientId must also be          
                                      provided. This value can also be provided 
                                      via the SYMBOL_UPLOAD_CLIENT_SECRET       
                                      environment variable.                     
  -r, --remove                        Removes symbols for a specified database, 
                                      application, and version. If this option  
                                      is provided no other actions are taken.   
  -f, --files string (optional)       Glob pattern that specifies a set of      
                                      files to upload. For example,             
                                      **/*.{pdb,exe,dll} will recursively       
                                      search for .pdb, .exe, and .dll files.    
                                      Defaults to "*.js.map"                    
  -d, --directory string (optional)   Path of the base directory used to search 
                                      for symbol files. This value will be      
                                      combined with the --files glob. Defaults  
                                      to '.'                                    
  -m, --dumpSyms boolean (optional)   Use dump_syms to generate and upload sym  
                                      files for specified binaries.             
  -l, --localPath string (optional)   Path to a directory to copy symbols to.   
                                      If provided, the files will be copied to  
                                      the provided path instead of being        
                                      uploaded to BugSplat. Useful for creating 
                                      a self-hosted symbol server.              

  The -i and -s arguments are not required if you set the environment variables 
  SYMBOL_UPLOAD_CLIENT_ID and SYMBOL_UPLOAD_CLIENT_SECRET.                      

Example

  symbol-upload -b your-bugsplat-database -a your-application-name -v your-     
  version -i your-client-id -s your-client-secret [ -f "*.js.map" -d            
  "/path/to/containing/dir" ]                                                   

Links

  🐛 https://bugsplat.com                          
                                                   
  💻 https://github.com/BugSplat-Git/symbol-upload 
                                                   
  💌 support@bugsplat.com
```

Run symbol-upload specifying a [glob](https://www.npmjs.com/package/glob#glob-primer) pattern for `-f` and a path with forward slashes for `-d`. Multiple file types can be specified in curly brackets separated by a comma, and wildcards can be used to search directories recursively. For example, `**/*.{pdb,exe,dll}` will search for all `.pdb`, `.exe`, and `.dll` files in the current directory and all subdirectories. Optionally, you can specify the `-m` flag to run [dump_syms](https://github.com/BugSplat-Git/node-dump-syms) against the specified binaries and upload the resulting `.sym` files.

### Environment Variables

| Variable | Description |
| --- | --- |
| `BUGSPLAT_DATABASE` | Your BugSplat database name. Used when `-b` is not provided. |
| `SYMBOL_UPLOAD_CLIENT_ID` | OAuth2 Client Credentials Client ID. Used when `-i` is not provided. |
| `SYMBOL_UPLOAD_CLIENT_SECRET` | OAuth2 Client Credentials Client Secret. Used when `-s` is not provided. |
| `BUGSPLAT_HOST` | Base URL that authentication and upload requests are sent to. Defaults to `https://api.bugsplat.com`. |

### Source Maps

A [debug ID](https://github.com/tc39/ecma426/blob/main/proposals/debug-id.md) is a UUID that a build writes into both a JavaScript file (as a `//# debugId=<uuid>` comment) and that file's source map (as a top-level `"debugId"` field). It ties the two together without relying on their file names.

symbol-upload looks for a debug ID in every `.map` file it uploads. No extra flags are needed.

```bash
symbol-upload -b your-database -a your-application -v your-version -d dist -f "**/*.js.map"
```

- A source map that contains a debug ID is uploaded by that ID, which lets BugSplat match it to its JavaScript file by ID instead of by file name and version.
- A source map that does not contain a debug ID is uploaded by file name, application, and version, exactly as in earlier versions of symbol-upload.

The ID is read from the top-level `debugId` field, or from `debug_id` when there is no `debugId`. It must be a UUID: 32 hexadecimal characters in upper or lower case, with or without hyphens. symbol-upload lowercases the ID and removes the hyphens before uploading. A source map whose ID is not a UUID, or whose contents are not valid JSON, is uploaded as a source map without a debug ID.

### Self-Hosted Symbol Servers

The symbol-upload tool can be used to create a [SymSrv](https://learn.microsoft.com/en-us/windows/win32/debug/symbol-servers-and-symbol-stores) directory structure for Windows symbols that is compatible with both BugSplat and [Microsoft Visual Studio](https://learn.microsoft.com/en-us/visualstudio/debugger/specify-symbol-dot-pdb-and-source-files-in-the-visual-studio-debugger?view=vs-2022#configure-location-of-symbol-files-and-loading-options). Additionally, symbol-upload can also create a SymSrv directory structure for macOS and Crashpad symbols that is compatible with BugSplat.

To upload symbols to a local directory, provide the `-l` flag and a path where the symbols will be copied.

```bat
symbol-upload -f "**/*.{pdb,exe,dll}" -l "C:\path\to\output"
```

Every file that has a debug ID is copied to `<module name>/<debug ID>/<file name>` under that path, and a file without one is skipped with a warning. Source maps follow the same rule. A `.map` file that contains a [debug ID](#source-maps) is copied to `<file name>/<debug ID>/<file name>`, where the debug ID is lowercase with its hyphens removed. A `.map` file without a debug ID is skipped.

Next, use a sync tool to upload the directory to a cloud services provider. The following is an example that uses `s3 sync` via the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html).

```bat
aws s3 sync . s3://your-bucket-name-here
```

To connect BugSplat to your self-hosted symbol server please refer to our Symbol Server [documentation](https://docs.bugsplat.com/introduction/development/working-with-symbol-files/symbol-servers).

## API

Install this package locally 

```bash
npm i @bugsplat/symbol-upload
```

### Module Compatibility

This package supports both ES modules (ESM) and CommonJS (CJS) formats. You can use it in either environment:

**ES Modules (ESM):**
```ts
import { uploadSymbols } from '@bugsplat/symbol-upload';
```

**CommonJS (CJS):**
```js
const { uploadSymbols } = require('@bugsplat/symbol-upload');
```

### uploadSymbols

Upload your symbol files to BugSplat by calling the `uploadSymbols` function with an [OAuth2 Client Credentials](https://docs.bugsplat.com/introduction/development/web-services/oauth2#client-credentials) Client ID and Client Secret, and the files to upload.

```ts
const symbolFileInfos = await uploadSymbols({
  database,
  application,
  version,
  clientId,
  clientSecret,
  directory: '/path/to/build/output',
  files: ['**/*.js.map'],
});
```

| Option | Type | Description |
| --- | --- | --- |
| `database` | `string` | Your BugSplat database name. Must match the database used to post crash reports. |
| `application` | `string` | The name of your application. |
| `version` | `string` | Your application's version. |
| `clientId` | `string` | An OAuth2 Client Credentials Client ID for the database. |
| `clientSecret` | `string` | An OAuth2 Client Credentials Client Secret for the database. |
| `directory` | `string` | Base directory used to search for symbol files. |
| `files` | `string \| string[]` | One or more glob patterns, relative to `directory` and written with forward slashes. |
| `host` | `string` (optional) | Base URL that authentication and upload requests are sent to. Defaults to the `BUGSPLAT_HOST` environment variable, then `https://api.bugsplat.com`. |

`uploadSymbols` uploads each file the same way the command line does, including uploading [source maps by debug ID](#source-maps). It resolves with one `{ path, moduleName, dbgId }` object per file it found, where `dbgId` is the debug ID the file was uploaded by, or an empty string if the file has none. It rejects if no files match, if authentication fails, or if an upload fails.

`uploadSymbols` is safe to call from a bundler plugin or a build script:

- It creates a `tmp-<uuid>` folder in the current working directory for compressed files and removes it before the returned promise settles.
- It stops its compression workers before the returned promise settles, so it does not keep the calling process running.
- Calls made while another call is in progress run one after another.
- Progress is written with `console.log`.

The lower-level `uploadSymbolFiles(bugsplat, database, application, version, symbolFileInfos)` function is still exported. It uploads a list of `SymbolFileInfo` objects with a client you have already authenticated, and it does not create the temp folder or stop the compression workers, so prefer `uploadSymbols`.

If you've done everything correctly, your symbols should appear when you click the application link on the [Versions](https://app.bugsplat.com/v2/versions) page.

<img width="1728" alt="image" src="https://github.com/BugSplat-Git/symbol-upload/assets/2646053/7314bd36-05db-4188-89e4-10f4e7442cec">

Thanks for using BugSplat!
