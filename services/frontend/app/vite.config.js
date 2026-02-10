const { defineConfig } = require("vite");
const reactImport = require("@vitejs/plugin-react");

const react = reactImport.default ?? reactImport;

// Polyfill new ArrayBuffer/SharedArrayBuffer accessors when running under Node 18.
if (typeof ArrayBuffer !== "undefined") {
  const descriptor = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resizable");
  if (!descriptor) {
    Object.defineProperty(ArrayBuffer.prototype, "resizable", {
      configurable: true,
      get: () => false
    });
  }
}

if (typeof SharedArrayBuffer !== "undefined") {
  const descriptor = Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, "growable");
  if (!descriptor) {
    Object.defineProperty(SharedArrayBuffer.prototype, "growable", {
      configurable: true,
      get: () => false
    });
  }
}

module.exports = defineConfig({
  plugins: [react()],
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: [
      "localhost",
      "0.0.0.0",
      "127.0.0.1",
      "student-and-invigilator-provisions-project-production-0434.up.railway.app"
    ]
  },
  preview: {
    host: "0.0.0.0",
    port: 3000
  }
});
