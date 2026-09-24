import crypto from "crypto";
import fs from "fs";
import path from "path";

interface BranchConfig {
  branchId: string;
  secretKey: string;
  branchName: string;
}

const isPkg = Boolean((process as any).pkg);

function getConfigPath(): string {
  const base = isPkg ? path.dirname(process.execPath) : path.resolve(__dirname, "../../../");
  return path.join(base, "branch-config.json");
}

export function getBranchConfig(): BranchConfig {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as BranchConfig;
  }
  const config: BranchConfig = {
    branchId: crypto.randomUUID(),
    secretKey: crypto.randomBytes(32).toString("hex"),
    branchName: "Branch",
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return config;
}

export function saveBranchConfig(updates: Partial<Pick<BranchConfig, "branchName">>): BranchConfig {
  const config = getBranchConfig();
  const updated = { ...config, ...updates };
  fs.writeFileSync(getConfigPath(), JSON.stringify(updated, null, 2));
  return updated;
}
