/// <reference types="vitest" />
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: false,
    setupFiles: "./test/setup.ts",
    coverage: {
      reporter: ["text", "html"]
    }
  }
})
