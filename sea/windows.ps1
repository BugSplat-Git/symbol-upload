node --experimental-sea-config sea-config.json
node -e "require('fs').copyFileSync(process.execPath, '.\\dist\\symbol-upload-windows.exe')"
signtool remove /s .\dist\symbol-upload-windows.exe
npx postject .\dist\symbol-upload-windows.exe NODE_SEA_BLOB .\dist\sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
#signtool sign /fd SHA256 symbol-upload-windows.exe 