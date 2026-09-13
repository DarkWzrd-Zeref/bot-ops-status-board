import { spawn } from "node:child_process";
const bus = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "watch", "server/index.ts"], {
  stdio: "inherit", env: { ...process.env, PORT: process.env.BUS_PORT || "8787", SERVE_STATIC: "0" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => bus.kill(signal));
bus.on("exit", code => process.exit(code ?? 0));
