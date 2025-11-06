/**
 * Get the directory name of the current module (CommonJS compatible)
 * Equivalent to __dirname in CommonJS
 */
function getDirname() {
  return __dirname;
}

/**
 * Get the file name of the current module (CommonJS compatible)
 * Equivalent to __filename in CommonJS
 */
function getFilename() {
  return __filename;
}

module.exports = { getDirname, getFilename };

