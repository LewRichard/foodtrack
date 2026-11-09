import { describe, expect, it } from "vitest";
import { supabaseVerifier } from "../server/auth.ts";
import { codeMatches, configFromEnv, scanAccess, ScanLimiter, type GuardConfig } from "../server/guard.ts";

describe("access code", () => {
  it("allows everything when no code is configured", () => {
    expect(codeMatches("", undefined)).toBe(true);
  });

  it("requires an exact match when a code is set", () => {
    expect(codeMatches("tofu42", "tofu42")).toBe(true);
    expect(codeMatches("tofu42", " tofu42 ")).toBe(true);
    expect(codeMatches("tofu42", "tofu4")).toBe(false);
    expect(codeMatches("tofu42", "TOFU42")).toBe(false);
    expect(codeMatches("tofu42", undefined)).toBe(false);
  });
});

describe("config", () => {
  it("uses defaults and parses numbers", () => {
    expect(configFromEnv({})).toEqual({
      accessCode: "",
      requireSignIn: false,
      perIpPerHour: 30,
      dailyLimit: 300,
      allowedOrigins: ["capacitor://localhost"],
    });
    expect(
      configFromEnv({
        APP_ACCESS_CODE: " x ",
        SCANS_PER_IP_PER_HOUR: "5",
        DAILY_SCAN_LIMIT: "0",
        ALLOWED_ORIGINS: "capacitor://localhost, https://example.com",
        REQUIRE_SIGN_IN: "true",
      }),
    ).toEqual({
      accessCode: "x",
      requireSignIn: true,
      perIpPerHour: 5,
      dailyLimit: 0,
      allowedOrigins: ["capacitor://localhost", "https://example.com"],
    });
    expect(configFromEnv({ SCANS_PER_IP_PER_HOUR: "lots" }).perIpPerHour).toBe(30);
  });
});

describe("ScanLimiter", () => {
  const t0 = Date.UTC(2026, 10, 9, 12);
  const minute = 60_000;

  it("limits each IP per sliding hour", () => {
    const l = new ScanLimiter(2, 100);
    expect(l.take("a", t0)).toBeNull();
    expect(l.take("a", t0 + minute)).toBeNull();
    expect(l.take("a", t0 + 2 * minute)).toBe("ip");
    expect(l.take("b", t0 + 2 * minute)).toBeNull(); // other visitors unaffected
    expect(l.take("a", t0 + 61 * minute)).toBeNull(); // first scan has aged out
  });

  it("caps the whole server per UTC day and resets the next day", () => {
    const l = new ScanLimiter(0, 2);
    expect(l.take("a", t0)).toBeNull();
    expect(l.take("b", t0)).toBeNull();
    expect(l.take("c", t0)).toBe("daily");
    expect(l.take("c", t0 + 24 * 60 * minute)).toBeNull();
  });
});

describe("who may scan", () => {
  const base: GuardConfig = { accessCode: "", requireSignIn: false, perIpPerHour: 30, dailyLimit: 300, allowedOrigins: [] };

  it("is open when nothing is required", () => {
    expect(scanAccess(base, false, undefined)).toBe("ok");
  });

  it("requires sign-in, without any code, when REQUIRE_SIGN_IN is on", () => {
    const cfg = { ...base, requireSignIn: true };
    expect(scanAccess(cfg, false, undefined)).toBe("sign_in_required");
    expect(scanAccess(cfg, true, undefined)).toBe("ok");
  });

  it("lets signed-in users skip the access code", () => {
    const cfg = { ...base, accessCode: "tofu42" };
    expect(scanAccess(cfg, false, undefined)).toBe("access_code_required");
    expect(scanAccess(cfg, false, "tofu42")).toBe("ok");
    expect(scanAccess(cfg, true, undefined)).toBe("ok");
  });

  it("still accepts the code as an alternative to signing in", () => {
    const cfg = { ...base, accessCode: "tofu42", requireSignIn: true };
    expect(scanAccess(cfg, false, "wrong")).toBe("sign_in_required");
    expect(scanAccess(cfg, false, "tofu42")).toBe("ok");
  });
});

describe("Supabase sign-in check", () => {
  const env = { VITE_SUPABASE_URL: "https://abc.supabase.co/rest/v1/", VITE_SUPABASE_ANON_KEY: "sb_publishable_x" };

  function fakeFetch(responses: Record<string, { status: number; body?: unknown }>) {
    const calls: string[] = [];
    const fn = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      const auth = new Headers(init?.headers).get("authorization") ?? "";
      const r = responses[auth.replace("Bearer ", "")] ?? { status: 401, body: { msg: "invalid JWT" } };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    }) as typeof fetch;
    return { fn, calls };
  }

  it("is off when Supabase isn't configured", () => {
    expect(supabaseVerifier({})).toBeNull();
  });

  it("accepts a valid token, rejects others, and caches the answer", async () => {
    const { fn, calls } = fakeFetch({ good: { status: 200, body: { id: "user-1" } } });
    const verify = supabaseVerifier(env, fn)!;
    expect(await verify("good")).toBe("user-1");
    expect(await verify("good")).toBe("user-1");
    expect(await verify("forged")).toBeNull();
    expect(calls.filter((u) => u === "https://abc.supabase.co/auth/v1/user")).toHaveLength(2); // good once (cached) + forged
  });

  it("doesn't remember a failure caused by Supabase being down", async () => {
    let down = true;
    const fn = (async () =>
      down ? new Response("", { status: 503 }) : new Response(JSON.stringify({ id: "user-1" }), { status: 200 })) as typeof fetch;
    const verify = supabaseVerifier(env, fn)!;
    expect(await verify("good")).toBeNull();
    down = false;
    expect(await verify("good")).toBe("user-1");
  });
});
