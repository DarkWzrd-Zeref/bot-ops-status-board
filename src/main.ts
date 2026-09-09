import "./style.css";
import { connectLive } from "./core/live.ts";
import { bootRuntime } from "./core/runtime.ts";
import { makeGame } from "./game/config.ts";
import { mountHud } from "./ui/hud.ts";

bootRuntime();
connectLive();

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<div id="game-root"></div><div id="hud"></div>`;
makeGame(document.getElementById("game-root")!);
mountHud(document.getElementById("hud")!);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js");
  });
}
