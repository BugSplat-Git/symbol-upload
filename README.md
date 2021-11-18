[![BugSplat](https://s3.amazonaws.com/bugsplat-public/npm/header.png)](https://www.bugsplat.com)

# symbol-upload
This is a simple Node.js utility and set of libraries for uploading symbol files or source maps to [BugSplat](https://www.bugsplat.com). This utility is designed to be used in your build process to automatically upload symbols to BugSplat for each production build. This package can be used as a library or a command line utility.

## Command Line
1. Install this package globally `npm i -g @bugsplat/symbol-upload`
2. Run symbol-upload with `-h` to see the latest usage information:
```bash
bobby@BugSplat % ~ % symbol-upload -h

@bugsplat/symbol-upload

  symbol-upload contains a command line utility and a set of libraries to help  
  you upload symbol files to BugSplat.                                          

Usage

  -h, --help                             Print this usage guide.                                                       
  -b, --database string                  Your BugSplat database name. The value of database must match the value used  
                                         to post crash reports. This value can also be provided via the                
                                         BUGSPLAT_DATABASE environment variable.                                       
  -a, --application string               The name of your application. The value of application must match the value   
                                         used to post crash reports. If not provided symbol-upload will attempt to use 
                                         the value of the name field in package.json if it exists in the current       
                                         working directory.                                                            
  -v, --version string                   Your application's version. The value of version must match the value used to 
                                         post crash reports. If not provided symbol-upload will attempt to use the     
                                         value of the version field in package.json if it exists in the current        
                                         working directory.                                                            
  -u, --user string (optional)           The email address used to log into your BugSplat account. If provided         
                                         --password must also be provided. This value can also be provided via the     
                                         SYMBOL_UPLOAD_USER environment variable.                                      
  -p, --password string (optional)       The password for your BugSplat account. If provided --user must also be       
                                         provided. This value can also be provided via the SYMBOL_UPLOAD_PASSWORD      
                                         environment variable.                                                         
  -i, --clientId string (optional)       An OAuth2 Client Credentials Client ID for the specified database. If         
                                         provided --clientSecret must also be provided. This value can also be         
                                         provided via the SYMBOL_UPLOAD_CLIENT_ID environment variable.                
  -s, --clientSecret string (optional)   An OAuth2 Client Credentials Client Secret for the specified database. If     
                                         provided --clientId must also be provided. This value can also be provided    
                                         via the SYMBOL_UPLOAD_CLIENT_SECRET environment variable.                     
  -r, --remove                           Removes symbols for a specified database, application, and version. If this   
                                         option is provided no other actions are taken.                                
  -f, --files string (optional)          Glob pattern that specifies a set of files to upload. Defaults to '*.js.map'  
  -d, --directory string (optional)      Path of the base directory used to search for symbol files. This value will   
                                         be combined with the --files glob. Defaults to '.'                            

  The -u and -p arguments are not required if you set the environment variables 
  SYMBOL_UPLOAD_USER and SYMBOL_UPLOAD_PASSWORD, or provide a clientId and      
  clientSecret.                                                                 
                                                                                
  The -i and -s arguments are not required if you set the environment variables 
  SYMBOL_UPLOAD_CLIENT_ID and SYMBOL_UPLOAD_CLIENT_SECRET, or provide a user    
  and password.                                                                 

Example

  symbol-upload -b your-bugsplat-database -a your-application-name -v your-     
  version [ -f "*.js.map" -d "/path/to/containing/dir" [ -u your-bugsplat-email 
  -p your-bugsplat-password ] OR [ -i your-client-id -s your-client-secret] ]   

Links

  🐛 https://bugsplat.com                          
                                                   
  💻 https://github.com/BugSplat-Git/symbol-upload 
                                                   
  💌 support@bugsplat.com   
```
3. Run symbol-upload specifying a [glob](https://www.npmjs.com/package/glob#glob-primer) pattern for `-f` and a path with forward slashes for `-d`

## API

1. Install this package locally `npm i @bugsplat/symbol-upload`.
2. Import `BugSplatApiClient` and `SymbolsApiClient` from @bugsplat/symbol-upload. Alternatively, you can import `OAuth2ClientCredentialsApiClient` if you'd prefer to authenticate with an [OAuth2 Client Credentials](https://docs.bugsplat.com/introduction/development/web-services/oauth2#client-credentials) Client ID and Client Secret.

```ts
import { BugSplatApiClient, OAuth2ClientCredentialsApiClient, SymbolsApiClient } from '@bugsplat/symbol-upload';
```

3. Create a new instance of `BugSplatApiClient` using the `createAuthenticatedClientForNode` async factory function or `OAuth2ClientCredentialsApiClient` using the `createAuthenticatedClient` async factory function.

```ts
const bugsplat = await BugSplatApiClient.createAuthenticatedClientForNode(email, password);
```

```ts
const bugsplat = await OAuth2ClientCredentialsApiClient.createAuthenticatedClient(clientId, clientSecret);
```

4. Create an `UploadableFile` object for each symbol file path.

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

5. Create an instance of `SymbolsApiClient` passing it an instance of `BugSplatApiClient`.

```ts
const symbolsApiClient = new SymbolsApiClient(bugsplat);
```

6. Await the call to `postSymbols` passing it the name of your BugSplat `database`, `application`, `version` and an array of `files`. These values need to match the values you used to initialize BugSplat on whichever [platform](https://docs.bugsplat.com/introduction/getting-started/integrations) you've integrated with.

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
