node --experimental-sea-config sea-config.json
cp $(command -v node) ./dist/symbol-upload-macos
codesign --remove-signature ./dist/symbol-upload-macos
npx postject ./dist/symbol-upload-macos NODE_SEA_BLOB ./dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA
codesign --sign - ./dist/symbol-upload-macos