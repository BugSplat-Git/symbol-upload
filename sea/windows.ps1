node --experimental-sea-config sea-config.json
node -e "require('fs').copyFileSync(process.execPath, '.\\dist\\symbol-upload-windows.exe')"
$signtool = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe"
& $signtool remove /s ".\dist\symbol-upload-windows.exe"
npx postject .\dist\symbol-upload-windows.exe NODE_SEA_BLOB .\dist\sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
