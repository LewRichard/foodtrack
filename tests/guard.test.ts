import { describe, expect, it } from "vitest";
import { codeMatches, configFromEnv, ScanLimiter } from "../server/guard.ts";

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
      }),
    ).toEqual({
      accessCode: "x",
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
