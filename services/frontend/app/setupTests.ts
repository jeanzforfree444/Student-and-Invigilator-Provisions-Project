// Polyfills for Node versions where resizable/growable buffers are not implemented yet.
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
});

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
