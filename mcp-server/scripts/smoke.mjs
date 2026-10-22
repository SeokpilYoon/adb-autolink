// Stdio smoke test: initialize + tools/list against dist/index.js (or the path given as argv[2]).
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, "..", "dist", "index.js");
const server = spawn(process.execPath, [entry], { stdio: ["pipe", "pipe", "inherit"] });
const expected = [
  "list_devices", "connect_device", "disconnect_device", "install_apk", "launch_app", "stop_app",
  "screenshot", "tap", "swipe", "input_text", "key_event", "logcat", "set_device_alias", "wake_device", "pair_device", "install_companion_app",
];

let buf = "";
const pending = new Map();
server.stdout.on("data", (d) => {
  buf += d.toString("utf8");
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    pending.get(msg.id)?.(msg);
  }
});
const send = (msg) => server.stdin.write(JSON.stringify(msg) + "\n");
const request = (id, method, params) =>
  new Promise((resolve) => {
    pending.set(id, resolve);
    send({ jsonrpc: "2.0", id, method, params });
  });

const timer = setTimeout(() => {
  console.error("smoke: timeout");
  server.kill();
  process.exit(1);
}, 15000);

const init = await request(1, "initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0" },
});
console.log("server:", JSON.stringify(init.result.serverInfo), "protocol:", init.result.protocolVersion);
send({ jsonrpc: "2.0", method: "notifications/initialized" });
const list = await request(2, "tools/list", {});
const names = list.result.tools.map((t) => t.name);
console.log(`tools (${names.length}): ${names.join(", ")}`);
const missing = expected.filter((n) => !names.includes(n));
clearTimeout(timer);
server.kill();
if (missing.length) {
  console.error("missing:", missing);
  process.exit(1);
}
console.log("smoke: OK");
