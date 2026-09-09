import "./style.css";
import { connectLive } from "./core/live.ts";
import { bootRuntime } from "./core/runtime.ts";
import { makeGame } from "./game/config.ts";
import { mountHud } from "./ui/hud.ts";
import { mountDistricts } from "./ui/districts.ts";

bootRuntime();
connectLive();

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `<div id="game-root"></div><div id="hud"></div>`;
mountHud(document.getElementById("hud")!);
mountDistricts(document.getElementById("hud")!);
void makeGame(document.getElementById("game-root")!).catch(error => {
  console.error("Map renderer failed", error);
  document.getElementById("game-root")!.textContent = "Map unavailable on this device. Crew, directives and station assignments remain available.";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js");
  });
}
