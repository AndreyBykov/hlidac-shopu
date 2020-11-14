#!/usr/bin/env node
import chokidar from "chokidar";
import esbuild from "esbuild";
import path from "path";
import fs from "fs";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const entryPoint = path.resolve(__dirname, "../extension/content.mjs");
const output = path.resolve(__dirname, "../extension/content.js");
const outputFF = path.resolve(__dirname, "../extension-dist/content.js");

async function build() {
  const service = await esbuild.startService();
  try {
    console.time();
    await service.build({
      color: true,
      entryPoints: [entryPoint],
      outfile: output,
      bundle: true
    });
    console.timeEnd();
    fs.copyFileSync(output, outputFF);
  } catch (err) {
    console.error(err);
  } finally {
    service.stop();
  }
}

console.log("Watchin extension files");

build();

const watcher = chokidar.watch(["lib/**/*.js", "extension/**/*.mjs"]);
watcher.on("change", () => build());
