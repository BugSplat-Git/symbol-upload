[![BugSplat](https://s3.amazonaws.com/bugsplat-public/npm/header.png)](https://www.bugsplat.com)

# symbol-upload
This is a simple utility for uploading symbol files or source maps to [BugSplat](https://www.bugsplat.com). This utility is designed to be used in your build process to automatically upload symbols to BugSplat for each production build. This package can be used as a library or a command line utility.

## Command Line
1. Install this package globally `npm -g @bugsplat/symbol-upload`
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
1. Import both BugSplatClient and Symbols from @bugsplat/symbol-upload
```ts
import { BugSplatClient, Symbols } from '@bugsplat/symbol-upload';
```
2. Create a new instance of BugSplatClient
```ts
const client = new BugSplatClient();
```
3. Await the call to login passing it your BugSplat email and password
```ts
await client.login(email, password);
```
4. Create a new instance of Symbols with the name of your BugSplat database, application, version and an array of file paths. These values need to match the values you used to initialize BugSplat on whichever [platform](https://www.bugsplat.com/docs/platforms) you've integrated with
```ts
const symbols = new Symbols(database, application, version, files);
```
4. Await the call to symbols.post
```ts
await symbols.post();
```


If you've done everything correctly your symbols should now be shown on the [Symbols](https://app.bugsplat.com/v2/symbols) page.

![Symbols](https://bugsplat-public.s3.amazonaws.com/npm/symbol-upload/symbols.png)

Thanks for using BugSplat!