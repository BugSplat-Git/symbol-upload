// Entry point for `bun build --compile`. Embeds the pre-bundled worker
// as a file asset and stores its path for preload.ts before running the app.
// The dynamic import ensures __embeddedWorkerPath is set before the app starts,
// since static imports are hoisted and evaluated before the module body.
import compressionWorkerBundle from "../dist/compression.bundle.js" with { type: "file" };
(globalThis as any).__embeddedWorkerPath = compressionWorkerBundle;
await import("./index.ts");
