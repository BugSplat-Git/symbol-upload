node --experimental-sea-config sea-config.json
cp $(command -v node) ./dist/symbol-upload-linux
# TODO BG remove signature?
npx postject ./dist/symbol-upload-linux NODE_SEA_BLOB ./dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
# TODO BG sign?
