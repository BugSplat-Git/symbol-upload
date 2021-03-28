[![BugSplat](https://s3.amazonaws.com/bugsplat-public/npm/header.png)](https://www.bugsplat.com)

# symbol-upload
This is a simple utility for uploading symbol files or source maps to [BugSplat](https://www.bugsplat.com). This utility is designed to be used in your build process to automatically upload symbols to BugSplat for each production build.

## Steps
1. Install this package `npm -g @bugsplat/symbol-upload`
2. Run symbol-upload with `-h` to see the latest usage information:
```bash
bobby@BugSplat % ~ % symbol-upload -h

symbol-upload usage:


        node ./symbol-upload -email fred@bugsplat.com -password ****** -database Fred -application my-ts-crasher -version 1.0.0 -files "**/*.js.map" [ -directory "/path/to/containing/dir" ]


❤️ support@bugsplat.com
```
3. Run symbol-upload specifying a [glob](https://www.npmjs.com/package/glob#glob-primer) pattern for `-files` and a path with forward slashes for `-directory`

Thanks for using BugSplat!