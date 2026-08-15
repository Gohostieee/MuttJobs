import { build } from "esbuild"
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, "..")
const dist = join(here, "dist")
const bundle = join(dist, "worker.cjs")
mkdirSync(dist, { recursive: true })

await build({
  entryPoints: [join(here, "src/main.ts")],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  minify: true,
  sourcemap: false,
  // Node SEA evaluates the injected entrypoint as CommonJS. The SDK uses
  // this URL to seed createRequire; the app always supplies codexPathOverride.
  define: {
    "import.meta.url": JSON.stringify(
      pathToFileURL(process.platform === "win32" ? "C:\\muttjobs-agent-worker.cjs" : "/muttjobs-agent-worker.cjs").href,
    ),
  },
})

if (process.argv.includes("--bundle-only")) process.exit(0)

const triples = {
  "win32-x64": "x86_64-pc-windows-msvc",
  "win32-arm64": "aarch64-pc-windows-msvc",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
}
const triple = triples[`${process.platform}-${process.arch}`]
if (!triple) throw new Error(`Unsupported SEA build target ${process.platform}-${process.arch}`)

const seaConfig = join(dist, "sea-config.json")
const blob = join(dist, "sea-prep.blob")
writeFileSync(seaConfig, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false }))
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" })

const extension = process.platform === "win32" ? ".exe" : ""
const output = join(appRoot, "src-tauri", "binaries", `muttjobs-agent-worker-${triple}${extension}`)
mkdirSync(dirname(output), { recursive: true })
rmSync(output, { force: true })
copyFileSync(process.execPath, output)
execFileSync(
  process.execPath,
  [
    join(appRoot, "node_modules", "postject", "dist", "cli.js"),
    output,
    "NODE_SEA_BLOB",
    blob,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    ...(process.platform === "darwin" ? ["--macho-segment-name", "NODE_SEA"] : []),
  ],
  { stdio: "inherit" },
)
console.log(`Built packaged agent worker: ${output}`)
