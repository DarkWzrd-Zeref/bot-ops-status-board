import { BASELINE_SKILLS, type BoosterResult, type UsageResult, type MemoryResult } from "../../shared/boosters.ts";

type Request = <T>(path: string, body?: unknown) => Promise<T>;
export function mountBoosters(dialog: HTMLDialogElement, request: Request, authorized: () => boolean) {
  const root = document.createElement("section");
  root.hidden = true;
  root.setAttribute("aria-label", "Baseline shared skills");
  const heading = document.createElement("h3"); heading.textContent = "Baseline shared skills"; root.append(heading);
  const help = document.createElement("p");
  help.textContent = "Available to each authenticated AI seat. Connect your private Zeref key below to inspect usage and shared memory.";
  root.append(help);
  const capability = document.createElement("p"); capability.textContent = "Service configuration not checked.";
  root.append(capability);
  const usageButton = document.createElement("button"); usageButton.type = "button"; usageButton.textContent = "Read account usage";
  const query = document.createElement("input"); query.type = "search"; query.maxLength = 500;
  query.placeholder = "Search decisions and lessons"; query.setAttribute("aria-label", "Search shared memory");
  const memoryButton = document.createElement("button"); memoryButton.type = "button"; memoryButton.textContent = "Recall shared memory";
  const output = document.createElement("div"); output.setAttribute("role", "status"); output.style.whiteSpace = "pre-wrap";
  root.append(usageButton, query, memoryButton, output);
  dialog.querySelector("#ecosystem-records")!.before(root);
  let checked = false, generation = 0, busy = false;
  function clear() { generation++; busy = false; output.textContent = ""; query.value = ""; }
  async function inspect(kind: "usage" | "memory") {
    if (!authorized() || busy) return;
    const mine = ++generation; busy = true; output.textContent = "Reading…";
    try {
      if (kind === "usage") {
        const result = await request<BoosterResult<UsageResult>>("/api/boosters/usage");
        if (mine !== generation || !authorized() || !dialog.open) return;
        if (result.state !== "ready") { output.textContent = result.message; return; }
        const data = result.data;
        output.textContent = [
          "Account usage snapshot · " + new Date(data.checkedAt).toLocaleString(),
          "Coverage: configured accounts only. External providers are not refreshed by this query.",
          ...data.accounts.flatMap(a => [
            a.provider + " / " + a.accountId + " · " + a.status + " · " + a.source + " · observed " + new Date(a.observedAt).toLocaleString(),
            ...(a.windows.length ? a.windows.map(w => w.label + ": " + w.remainingPercent + "% remaining · " + w.usedPercent +
              "% used · " + w.status + (w.resetsAt ? " · resets " + new Date(w.resetsAt).toLocaleString() : " · reset unavailable")) : [a.unavailableReason || "Usage unavailable"]),
          ]),
          "No configured source: " + (data.unconfiguredProviders.join(", ") || "none in supported list"),
        ].join("\n");
      } else {
        const result = await request<BoosterResult<MemoryResult>>("/api/boosters/memory?q=" + encodeURIComponent(query.value));
        if (mine !== generation || !authorized() || !dialog.open) return;
        output.textContent = result.state !== "ready" ? result.message : result.data.entries.length
          ? result.data.entries.map(e => e.title + " · " + e.kind + "\n" + e.body + "\nReported by " + e.seat +
            " · " + new Date(e.at).toLocaleString()).join("\n\n")
          : "No matching shared decisions or lessons.";
      }
    } catch { if (mine === generation) output.textContent = "Unable to read this skill. Check access and try again."; }
    finally { if (mine === generation) busy = false; }
  }
  usageButton.onclick = () => void inspect("usage");
  memoryButton.onclick = () => void inspect("memory");
  dialog.addEventListener("close", clear);
  return {
    show(active: boolean) {
      root.hidden = !active;
      usageButton.disabled = memoryButton.disabled = query.disabled = !authorized();
      if (!authorized()) clear();
      if (!active || checked) return;
      checked = true;
      void request<{ skills: Array<{ id: string; state: string }> }>("/api/boosters").then(data => {
        capability.textContent = BASELINE_SKILLS.map(skill => skill.name + ": " +
          (data.skills.find(row => row.id === skill.id)?.state || "unconfigured") + " · " + skill.tools.join(", ")).join("\n");
      }).catch(() => { checked = false; capability.textContent = "Service configuration unavailable."; });
    },
  };
}
