import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent, getEnvironment } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", async (_req, res) => {
  res.json({ ok: true, environment: await getEnvironment() });
});

app.post("/api/run", async (req, res) => {
  const task = String(req.body?.task || "").trim();
  if (!task) return res.status(400).json({ error: "Please enter a task." });

  try {
    const result = await runAgent(task);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(port, () => {
  console.log(`AgentScout running at http://localhost:${port}`);
});
