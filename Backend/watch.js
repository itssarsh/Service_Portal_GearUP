const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const watchDir = __dirname;
const watchedExtensions = new Set([".js", ".json", ".env"]);
const ignoredDirectories = new Set(["node_modules", ".git"]);

let serverProcess;
let restartTimer;
const watchers = new Map();

function isIgnoredPath(filePath) {
  return filePath
    .split(path.sep)
    .some((segment) => ignoredDirectories.has(segment));
}

function shouldRestart(filePath) {
  if (!filePath || isIgnoredPath(filePath)) return false;

  const baseName = path.basename(filePath);
  const extName = path.extname(filePath);

  return (
    watchedExtensions.has(extName) ||
    baseName === ".env" ||
    baseName === "package-lock.json"
  );
}

function startServer() {
  serverProcess = spawn("node", ["index.js"], {
    cwd: watchDir,
    stdio: "inherit",
  });

  serverProcess.on("exit", (code, signal) => {
    if (signal !== "SIGTERM" && signal !== "SIGINT" && code !== 0) {
      console.log(`Server exited with code ${code}`);
    }
  });
}

function restartServer(filename) {
  clearTimeout(restartTimer);

  restartTimer = setTimeout(() => {
    console.log(`Restarting server because ${filename} changed...`);

    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      serverProcess.once("exit", startServer);
      return;
    }

    startServer();
  }, 150);
}

function watchDirectory(directoryPath) {
  if (watchers.has(directoryPath) || isIgnoredPath(directoryPath)) {
    return;
  }

  try {
    const watcher = fs.watch(directoryPath, (eventType, filename) => {
      const changedPath = filename
        ? path.join(directoryPath, filename.toString())
        : directoryPath;

      if (eventType === "rename" && fs.existsSync(changedPath)) {
        tryRegisterDirectoryTree(changedPath);
      }

      if (shouldRestart(changedPath)) {
        restartServer(path.relative(watchDir, changedPath) || changedPath);
      }
    });

    watchers.set(directoryPath, watcher);
  } catch (error) {
    console.error(`Unable to watch ${directoryPath}: ${error.message}`);
  }
}

function tryRegisterDirectoryTree(targetPath) {
  if (!fs.existsSync(targetPath)) return;

  const stats = fs.statSync(targetPath);
  if (!stats.isDirectory()) return;

  registerDirectoryTree(targetPath);
}

function registerDirectoryTree(directoryPath) {
  if (isIgnoredPath(directoryPath)) return;

  watchDirectory(directoryPath);

  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    registerDirectoryTree(path.join(directoryPath, entry.name));
  }
}

function setupWatchers() {
  try {
    const recursiveWatcher = fs.watch(
      watchDir,
      { recursive: true },
      (eventType, filename) => {
        if (!filename) return;

        const changedPath = path.join(watchDir, filename.toString());

        if (shouldRestart(changedPath)) {
          restartServer(path.relative(watchDir, changedPath));
        }
      }
    );

    watchers.set(watchDir, recursiveWatcher);
    console.log("Watching backend files recursively...");
  } catch (error) {
    registerDirectoryTree(watchDir);
    console.log("Watching backend files recursively (fallback mode)...");
  }
}

startServer();
setupWatchers();

process.on("SIGINT", () => {
  for (const watcher of watchers.values()) {
    watcher.close();
  }

  if (serverProcess) {
    serverProcess.kill("SIGINT");
  }

  process.exit(0);
});
