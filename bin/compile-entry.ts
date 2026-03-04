// Entry point for `bun build --compile`. Embeds the pre-bundled worker
// as a file asset and stores its path for preload.ts before running the app.
import compressionWorkerBundle from "../dist/compression.bundle.js" with { type: "file" };
(globalThis as any).__embeddedWorkerPath = compressionWorkerBundle;
import "./index.ts";
