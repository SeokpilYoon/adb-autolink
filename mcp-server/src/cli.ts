import { resolveAdbPath } from "./adb.js";
import { ensureConnected, formatSnapshot, snapshot } from "./connector.js";
import { describeCandidate, loadAliases } from "./devices.js";

const USAGE = `Usage:
  adb-autolink devices             List connected and mDNS-discovered devices
  adb-autolink connect [device]    Connect (serial, ip:port, alias or model like S21 / S24+)`;

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "devices":
      console.log(`adb: ${resolveAdbPath()}`);
      console.log(formatSnapshot(await snapshot()));
      return 0;
    case "connect": {
      const r = await ensureConnected(rest[0]);
      for (const l of r.log) console.log(l);
      console.log(`Connected: ${describeCandidate(r.device, loadAliases())}`);
      return 0;
    }
    case undefined:
    case "-h":
    case "--help":
    case "help":
      console.log(USAGE);
      return cmd ? 0 : 1;
    default:
      console.error(`Unknown command "${cmd}"\n${USAGE}`);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error((e as Error).message ?? String(e));
    process.exit(1);
  },
);
