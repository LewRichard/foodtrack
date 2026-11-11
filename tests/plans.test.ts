import { describe, expect, it, vi } from "vitest";
import { limitFreeScans, memoryPlanStore, requirePremium, usageDay } from "../server/plans.ts";

function run(mw: ReturnType<typeof limitFreeScans>, userId: string | null, headers: Record<string, string> = {}) {
  const res = {
    locals: { userId } as Record<string, unknown>,
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
  };
  const req = { get: (h: string) => headers[h.toLowerCase()] };
  const next = vi.fn();
  return mw(req as never, res as never, next).then(() => ({ res, next }));
}

describe("usageDay", () => {
  const now = new Date("2026-11-11T20:00:00Z");
  it("uses the person's date when it's within a day of UTC", () => {
    expect(usageDay("2026-11-12", now)).toBe("2026-11-12");
    expect(usageDay("2026-11-10", now)).toBe("2026-11-10");
  });
  it("ignores a date far away or malformed", () => {
    expect(usageDay("2026-11-20", now)).toBe("2026-11-11");
    expect(usageDay("yesterday", now)).toBe("2026-11-11");
    expect(usageDay(undefined, now)).toBe("2026-11-11");
  });
});

describe("limitFreeScans", () => {
  const today = new Date().toISOString().slice(0, 10);
  it("allows 5 a day for free accounts, then refuses", async () => {
    const store = memoryPlanStore();
    const mw = limitFreeScans(store, { freeScansPerDay: 5 });
    for (let i = 1; i <= 5; i++) {
      const { res, next } = await run(mw, "free", { "x-local-date": today });
      expect(next).toHaveBeenCalled();
      expect(res.headers["x-ai-used"]).toBe(String(i));
    }
    const { res, next } = await run(mw, "free", { "x-local-date": today });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ code: "scan_limit", limit: 5 });
  });

  it("gives a log back when the AI fails", async () => {
    const store = memoryPlanStore();
    const mw = limitFreeScans(store, { freeScansPerDay: 1 });
    const first = await run(mw, "u", { "x-local-date": today });
    await (first.res.locals.giveBack as () => Promise<void>)();
    const again = await run(mw, "u", { "x-local-date": today });
    expect(again.next).toHaveBeenCalled();
  });

  it("doesn't count Premium, access-code users, or servers without plans", async () => {
    const store = memoryPlanStore({ pro: null });
    const mw = limitFreeScans(store, { freeScansPerDay: 0 });
    expect((await run(mw, "pro")).next).toHaveBeenCalled();
    expect((await run(mw, null)).next).toHaveBeenCalled();
    expect((await run(limitFreeScans(null, { freeScansPerDay: 0 }), "free")).next).toHaveBeenCalled();
    expect(store.usage.size).toBe(0);
  });

  it("treats expired Premium as free", async () => {
    const store = memoryPlanStore({ old: "2020-01-01T00:00:00Z" });
    const { res } = await run(limitFreeScans(store, { freeScansPerDay: 0 }), "old");
    expect(res.statusCode).toBe(429);
  });
});

describe("requirePremium", () => {
  it("lets Premium through and refuses free accounts", async () => {
    const store = memoryPlanStore({ pro: "2999-01-01T00:00:00Z" });
    expect((await run(requirePremium(store) as never, "pro")).next).toHaveBeenCalled();
    const free = await run(requirePremium(store) as never, "free");
    expect(free.next).not.toHaveBeenCalled();
    expect(free.res.statusCode).toBe(403);
    expect(free.res.body).toMatchObject({ code: "premium_required" });
  });
});
