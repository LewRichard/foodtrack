// Runs cloud sync: upload pending changes, then download what changed elsewhere.
// The network side is behind the `Remote` interface (Supabase in cloud.ts, a fake in tests).

import { useSyncExternalStore } from "react";
import { afterPush, collectPush, isEmptyPush, mergeRemote, type Pulled, type PushBatch, type SyncedState } from "./syncState.ts";

export interface Remote {
  push(batch: PushBatch): Promise<void>;
  pull(cursors: SyncedState["sync"]["cursors"]): Promise<Pulled>;
}

/** One sync round against `remote`, reading and writing state through the given functions. */
export async function syncOnce<S extends SyncedState>(remote: Remote, get: () => S, set: (s: S) => void): Promise<void> {
  const batch = collectPush(get());
  if (!isEmptyPush(batch)) {
    await remote.push(batch);
    set(afterPush(get(), batch));
  }
  const pulled = await remote.pull(get().sync.cursors);
  const merged = mergeRemote(get(), pulled);
  set({ ...merged, sync: { ...merged.sync, lastSyncedAt: Date.now() } });
}

// ---- Status shown in the UI --------------------------------------------------------------------

export type SyncStatus =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "offline" }
  | { kind: "error"; message: string };

let status: SyncStatus = { kind: "idle" };
const listeners = new Set<() => void>();

export function setSyncStatus(next: SyncStatus) {
  status = next;
  listeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}
