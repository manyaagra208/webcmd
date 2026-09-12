import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

function check(label, command, args) {
  try {
    const out = execFileSync(command, args, { encoding: "utf8", timeout: 8000 }).trim();
    console.log(`OK   ${label}: ${out.split("\n")[0]}`);
  } catch {
    console.log(`MISS ${label}`);
  }
}

check("Node", process.execPath, ["--version"]);
check("npm", process.platform === "win32" ? "npm.cmd" : "npm", ["--version"]);
check("Webcmd", process.platform === "win32" ? "webcmd.cmd" : "webcmd", ["--version"]);
console.log(`INFO package.json: ${existsSync("package.json") ? "present" : "missing"}`);
console.log(`INFO .env: ${existsSync(".env") ? "present" : "missing (copy .env.example to .env)"}`);
