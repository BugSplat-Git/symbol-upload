// Preloaded into a subprocess so specs can tell a forced process.exit()
// apart from a natural event loop drain.
const { isMainThread } = require('node:worker_threads');

// Worker threads inherit this preload. In a worker process.exit() only ends that thread, and it's
// how a compression worker stops when its pool is terminated, so only the main thread is watched.
if (isMainThread) {
  const exit = process.exit.bind(process);

  process.exit = (code) => {
    console.error('FORCED_EXIT');
    return exit(code);
  };
}
