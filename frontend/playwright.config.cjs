const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e', workers: 1, timeout: 30000,
  globalSetup: './e2e/start-server.cjs',
  use: { baseURL: 'http://127.0.0.1:5179', headless: true, ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
});
