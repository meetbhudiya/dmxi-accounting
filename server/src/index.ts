import "dotenv/config";
import path from "path";
import fs from "fs";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { companiesRouter } from "./routes/companies";
import { companyScopedRouter } from "./routes/company-scoped";
import { publicRouter } from "./routes/public";
import { startAutoSync } from "./lib/autoSync";

const app = express();

// Unique token generated once when the server process starts.
// Any new deployment (new exe or server restart) gets a different token,
// which triggers the forced-update banner in all connected browsers.
const BUILD_TOKEN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

app.use(cors());
app.use(express.json({ limit: "70mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "DMXI" });
});

app.get("/api/version", (_req, res) => {
  res.json({ token: BUILD_TOKEN });
});

app.use("/api/auth", authRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/companies/:companyId", companyScopedRouter);
app.use("/api", publicRouter);

// Serve the React client in production (when client/dist exists beside the server)
const isPkg = Boolean((process as any).pkg);
const clientDist = isPkg
  ? path.join(path.dirname(process.execPath), "public")
  : path.join(__dirname, "../../client/dist");

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: any non-API route returns index.html
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err?.message ?? "Internal server error";
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`DMXI server listening on http://localhost:${port}`);
  startAutoSync().catch(console.error);
});
