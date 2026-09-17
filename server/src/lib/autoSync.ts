import cron, { ScheduledTask } from "node-cron";
import { prisma } from "./prisma";
import { buildExportBundle } from "./buildExportBundle";

const jobs = new Map<string, ScheduledTask>();

function minutesToCron(minutes: number): string {
  if (minutes <= 30) return `*/${minutes} * * * *`;
  const hours = Math.round(minutes / 60);
  return `0 */${hours} * * *`;
}

export async function runSync(companyId: string): Promise<{ status: string; at: Date }> {
  const config = await prisma.syncConfig.findUnique({ where: { companyId } });
  if (!config) throw new Error("No sync config found");

  const at = new Date();
  try {
    // Authenticate with HQ
    const loginRes = await fetch(`${config.hqUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: config.hqEmail, password: config.hqPassword }),
    });
    if (!loginRes.ok) {
      const body = await loginRes.json().catch(() => ({}));
      throw new Error((body as any)?.error ?? `HQ login failed (${loginRes.status})`);
    }
    const { token } = await loginRes.json() as { token: string };

    // Build this branch's export bundle
    const bundle = await buildExportBundle(companyId);

    // Push to HQ
    const importRes = await fetch(
      `${config.hqUrl}/api/companies/${config.hqCompanyId}/sync/import`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(bundle),
      }
    );
    if (!importRes.ok) {
      const body = await importRes.json().catch(() => ({}));
      throw new Error((body as any)?.error ?? `HQ import failed (${importRes.status})`);
    }

    await prisma.syncConfig.update({
      where: { companyId },
      data: { lastSyncAt: at, lastSyncStatus: "success" },
    });
    return { status: "success", at };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncConfig.update({
      where: { companyId },
      data: { lastSyncAt: at, lastSyncStatus: `error: ${message}` },
    });
    return { status: `error: ${message}`, at };
  }
}

export function scheduleCompany(config: {
  companyId: string;
  intervalMinutes: number;
  enabled: boolean;
}) {
  jobs.get(config.companyId)?.stop();
  jobs.delete(config.companyId);

  if (!config.enabled) return;

  const expr = minutesToCron(config.intervalMinutes);
  const task = cron.schedule(expr, () => {
    runSync(config.companyId).catch(console.error);
  });
  jobs.set(config.companyId, task);
}

export async function startAutoSync() {
  const configs = await prisma.syncConfig.findMany({ where: { enabled: true } });
  for (const cfg of configs) {
    scheduleCompany(cfg);
  }
  console.log(`Auto-sync: ${configs.length} branch(es) scheduled`);
}
