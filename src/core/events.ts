import type { GameEvent } from "./types.ts";

type Fn = (e: GameEvent) => void;

export class Bus {
  private subs = new Set<Fn>();
  on(fn: Fn): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
  emit(e: GameEvent): void {
    for (const fn of this.subs) fn(e);
  }
}

export const bus = new Bus();
