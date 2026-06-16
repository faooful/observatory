import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const apiRouteDir = resolve("app/api");
const disabledApiRouteDir = resolve(".cache/github-pages/app-api");

let movedApiRoute = false;

try {
  if (existsSync(apiRouteDir)) {
    rmSync(disabledApiRouteDir, { force: true, recursive: true });
    mkdirSync(dirname(disabledApiRouteDir), { recursive: true });
    renameSync(apiRouteDir, disabledApiRouteDir);
    movedApiRoute = true;
  }

  const result = spawnSync("npm", ["run", "build"], {
    env: {
      ...process.env,
      GITHUB_PAGES: "true"
    },
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
} finally {
  if (movedApiRoute) {
    renameSync(disabledApiRouteDir, apiRouteDir);
  }
}
