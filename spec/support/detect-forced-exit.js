// Preloaded into the CLI subprocess so specs can tell a forced process.exit()
// apart from a natural event loop drain.
const exit = process.exit.bind(process);

process.exit = (code) => {
  console.error('FORCED_EXIT');
  return exit(code);
};
