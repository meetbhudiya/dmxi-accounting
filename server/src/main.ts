import path from "path";
import fs from "fs";

// When bundled with pkg, process.pkg is defined
const isPkg = Boolean((process as any).pkg);

if (isPkg) {
  const exeDir = path.dirname(process.execPath);

  // Load .env from the same directory as the exe BEFORE importing anything
  // that reads env vars (e.g. PrismaClient, JWT_SECRET)
  const envFile = path.join(exeDir, ".env");
  if (fs.existsSync(envFile)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("dotenv").config({ path: envFile, override: true });
  }

  // Tell Prisma where to find the native query engine binary.
  // The .dll.node file must sit beside the exe in the release folder.
  const engineFile = path.join(exeDir, "query_engine-windows.dll.node");
  if (fs.existsSync(engineFile)) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = engineFile;
  }
}

// Dynamically require the server so all the above env setup runs first.
// (import statements are hoisted; require() is not.)
// eslint-disable-next-line @typescript-eslint/no-var-requires
require("./index");
