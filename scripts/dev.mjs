import { spawn } from "node:child_process";

const env = { ...process.env };
const bus = spawn("npx", ["tsx", "server/index.ts"], {
  stdio: "inherit",
  env: { ...env, PORT: env.BUS_PORT || "8787", SERVE_STATIC: "0" },
});
const game = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", "4611"], {
  stdio: "inherit",
  env,
});

function stop() {
  bus.kill("SIGTERM");
  game.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

bus.on("exit", (code) => {
  if (code) process.exit(code);
});
game.on("exit", (code) => {
  if (code) process.exit(code);
});
