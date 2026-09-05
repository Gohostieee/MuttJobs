import { defineConfig } from "@playwright/test"
import { join } from "node:path"
import { existsSync } from "node:fs"
const localChromium = join(
  process.env.LOCALAPPDATA || "",
  "ms-playwright/chromium-1223/chrome-win64/chrome.exe",
)
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    launchOptions: existsSync(localChromium)
      ? { executablePath: localChromium }
      : {},
  },
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:1420",
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command:
        "cargo test --manifest-path src-tauri/Cargo.toml ui_fixture_server --lib -- --ignored --nocapture",
      url: "http://127.0.0.1:1439",
      reuseExistingServer: true,
      timeout: 300000,
    },
  ],
})
