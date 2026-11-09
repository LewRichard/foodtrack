import { describe, expect, it } from "vitest";
import { DEFAULT_GOALS } from "../shared/nutrition.ts";
import { projectUrl } from "../shared/supabase.ts";
import { syncOnce, type Remote } from "../src/lib/sync.ts";
import {
  attachAccount,
  EMPTY_SYNC,
  hasPending,
  isUuid,
  markDayChanged,
  markEntriesChanged,
  markEntryDeleted,
  markSettingsChanged,
  type DayRow,
  type EntryRow,
  type SettingsRow,
  type SyncedState,
} from "../src/lib/syncState.ts";
import type { LogEntry } from "../src/lib/types.ts";

// In-memory cloud with the same rules as supabase/schema.sql: an older update never overwrites a
// newer row, and each write gets a later sync time.
class FakeCloud {
  entries = new Map<string, EntryRow>();
  days = new Map<string, DayRow>();
  settings: SettingsRow | null = null;
  private clock = 0;
  offline = false;

  private stamp() {
    this.clock++;
    return new Date(Date.UTC(2026, 0, 1, 0, 0, this.clock)).toISOString();
  }

  remote(): Remote {
    return {
      push: async (batch) => {
        if (this.offline) throw new Error("offline");
        for (const r of batch.entries) {
          const old = this.entries.get(r.id);
          if (!old || r.updated_at >= old.updated_at) this.entries.set(r.id, { ...r, synced_at: this.stamp() });
        }
        for (const d of batch.days) {
          const old = this.days.get(d.date);
          if (!old || d.updated_at >= old.updated_at) this.days.set(d.date, { ...d, synced_at: this.stamp() });
        }
        if (batch.settings && (!this.settings || batch.settings.updated_at >= this.settings.updated_at)) {
          this.settings = { ...batch.settings, synced_at: this.stamp() };
        }
      },
      pull: async (c) => {
        if (this.offline) throw new Error("offline");
        const after = <T extends { synced_at?: string }>(rows: T[], cursor: string | null) =>
          rows.filter((r) => !cursor || (r.synced_at ?? "") > cursor);
        return {
          entries: after([...this.entries.values()], c.entries),
          days: after([...this.days.values()], c.days),
          settings: after(this.settings ? [this.settings] : [], c.settings),
        };
      },
    };
  }
}

const BLANK: SyncedState = {
  entries: [],
  goals: DEFAULT_GOALS,
  profile: null,
  name: "",
  water: {},
  burned: {},
  weights: {},
  targetWeight: null,
  dayUpdatedAt: {},
  settingsUpdatedAt: 0,
  sync: EMPTY_SYNC,
};

/** A device: local state plus helpers mirroring the app's actions. */
function device(initial: SyncedState = BLANK) {
  let s = initial;
  const get = () => s;
  const set = (n: SyncedState) => {
    s = n;
  };
  return {
    get,
    set,
    sync: (cloud: FakeCloud) => syncOnce(cloud.remote(), get, set),
    signIn: (userId: string) => set(attachAccount(s, userId, BLANK)),
    add: (e: LogEntry, at: number) => set(markEntriesChanged({ ...s, entries: [...s.entries, { ...e, updatedAt: at }] }, [e.id])),
    rename: (id: string, name: string, at: number) =>
      set(markEntriesChanged({ ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, name, updatedAt: at } : e)) }, [id])),
    remove: (id: string, at: number) => {
      const e = s.entries.find((x) => x.id === id)!;
      set(markEntryDeleted({ ...s, entries: s.entries.filter((x) => x.id !== id) }, e, at));
    },
    water: (date: string, glasses: number, at: number) => set(markDayChanged({ ...s, water: { ...s.water, [date]: glasses } }, date, at)),
    name: (name: string, at: number) => set(markSettingsChanged({ ...s, name }, at)),
    weigh: (date: string, kg: number | null, at: number) => {
      const weights = { ...s.weights };
      if (kg === null) delete weights[date];
      else weights[date] = kg;
      set(markDayChanged({ ...s, weights }, date, at));
    },
    target: (kg: number | null, at: number) => set(markSettingsChanged({ ...s, targetWeight: kg }, at)),
  };
}

let n = 0;
function food(name: string, kcal = 100): LogEntry {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    date: "2026-11-09",
    meal: "lunch",
    name,
    portion: "1 serving",
    grams: 100,
    calories: kcal,
    protein: 1,
    carbs: 2,
    fat: 3,
    fiber: 0,
    sugar: 0,
    sodium: 0,
    confidence: "high",
    source: "manual",
    loggedAt: 1000,
  };
}

const USER = "u1";

describe("cloud sync", () => {
  it("uploads local changes and clears the queue", async () => {
    const cloud = new FakeCloud();
    const phone = device();
    phone.signIn(USER);
    phone.add(food("Pho"), 10);
    phone.water("2026-11-09", 3, 10);
    phone.name("Lew", 10);
    expect(hasPending(phone.get())).toBe(true);

    await phone.sync(cloud);

    expect(hasPending(phone.get())).toBe(false);
    expect([...cloud.entries.values()].map((r) => r.name)).toEqual(["Pho"]);
    expect(cloud.days.get("2026-11-09")?.water).toBe(3);
    expect(cloud.settings?.name).toBe("Lew");
  });

  it("brings a second device up to date", async () => {
    const cloud = new FakeCloud();
    const phone = device();
    phone.signIn(USER);
    phone.add(food("Pho", 480), 10);
    phone.water("2026-11-09", 4, 10);
    phone.name("Lew", 10);
    await phone.sync(cloud);

    const laptop = device();
    laptop.signIn(USER);
    await laptop.sync(cloud);

    expect(laptop.get().entries.map((e) => [e.name, e.calories])).toEqual([["Pho", 480]]);
    expect(laptop.get().water["2026-11-09"]).toBe(4);
    expect(laptop.get().name).toBe("Lew");
    expect(hasPending(laptop.get())).toBe(false);
  });

  it("keeps the newer edit when two devices change the same entry", async () => {
    const cloud = new FakeCloud();
    const phone = device();
    phone.signIn(USER);
    const pho = food("Pho");
    phone.add(pho, 10);
    await phone.sync(cloud);
    const laptop = device();
    laptop.signIn(USER);
    await laptop.sync(cloud);

    laptop.rename(pho.id, "Beef pho", 30); // newer
    phone.rename(pho.id, "Chicken pho", 20); // older, made offline
    await laptop.sync(cloud);
    await phone.sync(cloud); // phone's older edit must not win
    await laptop.sync(cloud);

    expect(cloud.entries.get(pho.id)?.name).toBe("Beef pho");
    expect(phone.get().entries[0].name).toBe("Beef pho");
    expect(laptop.get().entries[0].name).toBe("Beef pho");
  });

  it("deletes on every device", async () => {
    const cloud = new FakeCloud();
    const phone = device();
    phone.signIn(USER);
    const pho = food("Pho");
    phone.add(pho, 10);
    phone.add(food("Coffee"), 10);
    await phone.sync(cloud);
    const laptop = device();
    laptop.signIn(USER);
    await laptop.sync(cloud);

    phone.remove(pho.id, 20);
    await phone.sync(cloud);
    await laptop.sync(cloud);

    expect(laptop.get().entries.map((e) => e.name)).toEqual(["Coffee"]);
    expect(cloud.entries.get(pho.id)?.deleted).toBe(true);
    expect(phone.get().sync.pendingDeletes).toEqual([]);
  });

  it("keeps changes made offline and uploads them later", async () => {
    const cloud = new FakeCloud();
    const phone = device();
    phone.signIn(USER);
    cloud.offline = true;
    phone.add(food("Banh mi"), 10);
    await expect(phone.sync(cloud)).rejects.toThrow("offline");
    expect(phone.get().entries.map((e) => e.name)).toEqual(["Banh mi"]);
    expect(hasPending(phone.get())).toBe(true);

    cloud.offline = false;
    await phone.sync(cloud);
    expect(hasPending(phone.get())).toBe(false);
    expect([...cloud.entries.values()].map((r) => r.name)).toEqual(["Banh mi"]);
  });

  it("re-uploads an entry edited while an upload was in flight", async () => {
    const cloud = new FakeCloud();
    const phone = device();
    phone.signIn(USER);
    const pho = food("Pho");
    phone.add(pho, 10);
    const remote = cloud.remote();
    // The edit lands after the upload was sent but before it's confirmed.
    const racing: Remote = {
      push: async (b) => {
        await remote.push(b);
        phone.rename(pho.id, "Pho (large)", 20);
      },
      pull: remote.pull,
    };
    await syncOnce(racing, phone.get, phone.set);
    expect(phone.get().sync.pendingEntries).toContain(pho.id);
    expect(phone.get().entries[0].name).toBe("Pho (large)"); // the older cloud copy didn't overwrite it
    await phone.sync(cloud);
    expect(cloud.entries.get(pho.id)?.name).toBe("Pho (large)");
  });
});

describe("signing in", () => {
  it("moves a diary kept before signing in into the account, with database-safe ids", async () => {
    const cloud = new FakeCloud();
    const legacy: SyncedState = {
      ...BLANK,
      name: "Lew",
      settingsUpdatedAt: 1,
      water: { "2026-11-08": 5 },
      entries: [{ ...food("Old entry"), id: "lx3k9-abc123" }],
    };
    const phone = device(legacy);
    phone.signIn(USER);
    expect(isUuid(phone.get().entries[0].id)).toBe(true);
    await phone.sync(cloud);

    expect([...cloud.entries.values()].map((r) => r.name)).toEqual(["Old entry"]);
    expect(cloud.days.get("2026-11-08")?.water).toBe(5);
    expect(cloud.settings?.name).toBe("Lew");
  });

  it("doesn't let untouched default goals overwrite the account's settings", async () => {
    const cloud = new FakeCloud();
    const phone = device();
    phone.signIn(USER);
    phone.name("Lew", 50);
    await phone.sync(cloud);

    const fresh = device(); // new device, never edited settings
    fresh.signIn(USER);
    await fresh.sync(cloud);
    expect(fresh.get().name).toBe("Lew");
    expect(cloud.settings?.name).toBe("Lew");
  });

  it("clears another account's data from the device", () => {
    const phone = device();
    phone.signIn("someone-else");
    phone.add(food("Their lunch"), 10);
    phone.signIn(USER);
    expect(phone.get().entries).toEqual([]);
    expect(phone.get().sync.userId).toBe(USER);
  });
});

describe("Supabase project address", () => {
  it("keeps only the base address however it was copied", () => {
    const base = "https://abcdefgh.supabase.co";
    expect(projectUrl(base)).toBe(base);
    expect(projectUrl(`${base}/`)).toBe(base);
    expect(projectUrl(`${base}/rest/v1/`)).toBe(base);
    expect(projectUrl(` "${base}/rest/v1" `)).toBe(base);
    expect(projectUrl("abcdefgh.supabase.co")).toBe(base);
    expect(projectUrl(`${base}​`)).toBe(base); // invisible character from copy-paste
    expect(projectUrl("https://supabase.com/dashboard/project/abcdefgh/settings/api")).toBe(base);
    expect(projectUrl("")).toBe("");
  });
});

describe("weight sync", () => {
  it("syncs weigh-ins, removals and the goal weight between devices", async () => {
    const cloud = new FakeCloud();
    const phone = device();
    const laptop = device();
    phone.signIn("u1");
    laptop.signIn("u1");
    phone.weigh("2026-11-08", 80.2, 100);
    phone.weigh("2026-11-09", 79.8, 101);
    phone.target(75, 102);
    await phone.sync(cloud);
    await laptop.sync(cloud);
    expect(laptop.get().weights).toEqual({ "2026-11-08": 80.2, "2026-11-09": 79.8 });
    expect(laptop.get().targetWeight).toBe(75);

    laptop.weigh("2026-11-08", null, 200); // laptop deletes a weigh-in
    await laptop.sync(cloud);
    await phone.sync(cloud);
    expect(phone.get().weights).toEqual({ "2026-11-09": 79.8 });
  });

  it("keeps local weights when the database has no weight column yet", async () => {
    const cloud = new FakeCloud();
    const phone = device();
    phone.signIn("u1");
    phone.weigh("2026-11-09", 70, 100);
    await phone.sync(cloud);
    // An old database drops the column: rows come back without `weight`.
    for (const [k, d] of cloud.days) {
      const { weight: _w, ...rest } = d;
      cloud.days.set(k, { ...rest, updated_at: 300 });
    }
    await phone.sync(cloud);
    expect(phone.get().weights).toEqual({ "2026-11-09": 70 });
  });
});

describe("health score sync", () => {
  it("carries a scanned meal's health score to other devices", async () => {
    const cloud = new FakeCloud();
    const phone = device();
    const laptop = device();
    phone.signIn("u1");
    laptop.signIn("u1");
    phone.add({ ...food("Grilled fish"), healthScore: 9 }, 100);
    phone.add(food("Cookie"), 101);
    await phone.sync(cloud);
    await laptop.sync(cloud);
    const byName = Object.fromEntries(laptop.get().entries.map((e) => [e.name, e.healthScore]));
    expect(byName).toEqual({ "Grilled fish": 9, Cookie: undefined });
  });
});
