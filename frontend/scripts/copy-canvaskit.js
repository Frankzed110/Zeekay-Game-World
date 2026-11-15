// Copies the CanvasKit wasm (Skia for web) into public/ so Expo web can serve it at /canvaskit.wasm.
const fs = require("fs");
const path = require("path");
try {
  const src = require.resolve("canvaskit-wasm/bin/full/canvaskit.wasm");
  const dest = path.join(__dirname, "..", "public", "canvaskit.wasm");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log("copied canvaskit.wasm -> public/");
} catch (e) {
  console.warn("canvaskit copy skipped:", e.message);
}
