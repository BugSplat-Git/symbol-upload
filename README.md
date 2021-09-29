[![BugSplat](https://s3.amazonaws.com/bugsplat-public/npm/header.png)](https://www.bugsplat.com)

# symbol-upload
This is a simple Node.js utility and set of libraries for uploading symbol files or source maps to [BugSplat](https://www.bugsplat.com). This utility is designed to be used in your build process to automatically upload symbols to BugSplat for each production build. This package can be used as a library or a command line utility.

## Command Line
1. Install this package globally `npm i -g @bugsplat/symbol-upload`
2. Run symbol-upload with `-h` to see the latest usage information:
```bash
bobby@BugSplat % ~ % symbol-upload -h

@bugsplat/symbol-upload contains a command line utility and set of libraries to help you upload symbols to BugSplat.


symbol-upload command line usage:


        symbol-upload -database Fred -application my-ts-crasher -version 1.0.0 [ -email fred@bugsplat.com -password ****** -files "*.js.map" -directory "/path/to/containing/dir" ]


The -email and -password arguments are optional if you set the environment variables SYMBOL_UPLOAD_EMAIL and SYMBOL_UPLOAD_PASSWORD respectively. 

The -files and -directory arguments are optional and will default to "*.js.map" and "." respectively.


❤️ support@bugsplat.com
```
3. Run symbol-upload specifying a [glob](https://www.npmjs.com/package/glob#glob-primer) pattern for `-files` and a path with forward slashes for `-directory`

## API

1. Install this package locally `npm i @bugsplat/symbol-upload`
2. Import both `BugSplatApiClient` and `SymbolsApiClient` from @bugsplat/symbol-upload

```ts
import { BugSplatApiClient, SymbolsApiClient } from '@bugsplat/symbol-upload';
```

3. Create a new instance of `BugSplatApiClient` using the `createAuthenticatedClientForNode` async factory function

```ts
const bugsplat = await BugSplatApiClient.createAuthenticatedClientForNode(email, password);
```

4. Create an `UploadableFile` object for each symbol file path

```ts
const files = paths.map(path => {
        const stat = fs.statSync(path);
        const size = stat.size;
        const name = basename(path);
        const file = fs.createReadStream(path);
        return {
                name,
                size,
                file
        };
});
```

5. Create an instance of `SymbolsApiClient` passing it an instance of `BugSplatApiClient`

```ts
const symbolsApiClient = new SymbolsApiClient(bugsplat);
```

6. Await the call to `postSymbols` passing it the name of your BugSplat `database`, `application`, `version` and an array of `files`. These values need to match the values you used to initialize BugSplat on whichever [platform](https://docs.bugsplat.com/introduction/getting-started/integrations) you've integrated with

```ts
await symbolsApiClient.postSymbols(
        database,
        application,
        version,
        files
);
```


If you've done everything correctly your symbols should now be shown on the [Symbols](https://app.bugsplat.com/v2/symbols) page.

![Symbols](https://bugsplat-public.s3.amazonaws.com/npm/symbol-upload/symbols.png)

Thanks for using BugSplat!
