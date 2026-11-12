// Compares AI models on the same food photos: calories, macros, speed and cost per scan.
//
//   npm run compare-models -- <photo folder> [--models a,b] [--lang vi] [--yes]
//
// The first model is the reference (default: claude-opus-5-5 vs claude-haiku-5-5).
// Optional <photo folder>/truth.json with real values (from a label or weighed food) adds
// accuracy against the truth:  { "pho.jpg": { "calories": 450, "protein": 25, "carbs": 60, "fat": 12 } }
// Writes compare-<time>.md and .json into the photo folder. Every call is a real, billed API call.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { analyzeFoodImage, type ImageMediaType } from "../server/analyze.ts";
import { isLang } from "../shared/languages.ts";
import type { AnalysisResult } from "../shared/nutrition.ts";

// USD per million tokens (input, output), prompts under 100K tokens.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
const TYPES: Record<string, ImageMediaType> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const MAX_BYTES = 5 * 1024 * 1024; // the API's limit per image
const NUTRIENTS = ["calories", "protein", "carbs", "fat"] as const;
type Totals = Record<(typeof NUTRIENTS)[number], number>;

interface Run {
  photo: string;
  model: string;
  ok: boolean;
  error?: string;
  seconds: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  isFood?: boolean;
  totals?: Totals;
  items?: string[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function totals(r: AnalysisResult): Totals {
  const sum = (k: keyof Totals) => Math.round(r.items.reduce((n, it) => n + (Number(it[k]) || 0), 0) * 10) / 10;
  return { calories: sum("calories"), protein: sum("protein"), carbs: sum("carbs"), fat: sum("fat") };
}

/** How far a value is from the reference, in percent of the reference. */
function pctOff(value: number, ref: number): number | null {
  if (!ref) return value ? null : 0;
  return (Math.abs(value - ref) / ref) * 100;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const f0 = (n: number) => (Number.isFinite(n) ? n.toFixed(0) : "–");
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "–");
const usd = (n: number) => (Number.isFinite(n) ? `$${n < 0.01 ? n.toFixed(4) : n.toFixed(3)}` : "–");

async function main() {
  const folder = process.argv[2];
  if (!folder || folder.startsWith("--") || !existsSync(folder)) {
    console.error("Usage: npm run compare-models -- <photo folder> [--models a,b] [--lang vi] [--yes]");
    process.exit(1);
  }
  const models = (arg("models") ?? "claude-opus-5-5,claude-haiku-5-5").split(",").map((m) => m.trim()).filter(Boolean);
  const lang = arg("lang") ?? "en";
  if (!isLang(lang)) throw new Error(`Unknown language ${lang}`);
  const truthPath = join(folder, "truth.json");
  const truth: Record<string, Partial<Totals>> = existsSync(truthPath) ? JSON.parse(readFileSync(truthPath, "utf8")) : {};

  const photos = readdirSync(folder)
    .filter((f) => TYPES[extname(f).toLowerCase()])
    .sort();
  const heic = readdirSync(folder).filter((f) => /\.hei[cf]$/i.test(f));
  if (heic.length) console.warn(`Skipping iPhone HEIC photos (save them as JPG first): ${heic.join(", ")}`);
  const tooBig = photos.filter((f) => readFileSync(join(folder, f)).length > MAX_BYTES);
  const usable = photos.filter((f) => !tooBig.includes(f));
  if (tooBig.length) console.warn(`Skipping photos over 5 MB (resize them first): ${tooBig.join(", ")}`);
  if (!usable.length) throw new Error(`No .jpg/.png/.webp photos in ${folder}`);

  // Rough upper bound so nobody is surprised by the bill: ~3k input + ~3k output tokens per call.
  const estimate = usable.length * models.reduce((n, m) => n + ((PRICES[m]?.[0] ?? 10) * 3000 + (PRICES[m]?.[1] ?? 50) * 3000) / 1e6, 0);
  console.log(`${usable.length} photos × ${models.length} models = ${usable.length * models.length} API calls, about ${usd(estimate)} at most.`);
  if (!process.argv.includes("--yes")) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("Continue? (y/n) ");
    rl.close();
    if (!/^y/i.test(answer.trim())) return;
  }

  const runs: Run[] = [];
  for (const [i, photo] of usable.entries()) {
    const data = readFileSync(join(folder, photo)).toString("base64");
    const type = TYPES[extname(photo).toLowerCase()];
    const results = await Promise.all(
      models.map(async (model): Promise<Run> => {
        let usage = { input_tokens: 0, output_tokens: 0 };
        const started = Date.now();
        try {
          const r = await analyzeFoodImage(data, type, undefined, lang, { model, onUsage: (u) => (usage = u) });
          return {
            photo,
            model,
            ok: true,
            seconds: (Date.now() - started) / 1000,
            ...cost(model, usage),
            isFood: r.isFood,
            totals: totals(r),
            items: r.items.map((it) => `${it.name} (${it.portion})`),
          };
        } catch (e) {
          return { photo, model, ok: false, error: e instanceof Error ? e.message : String(e), seconds: (Date.now() - started) / 1000, ...cost(model, usage) };
        }
      }),
    );
    runs.push(...results);
    console.log(
      `[${i + 1}/${usable.length}] ${photo}: ` +
        results.map((r) => `${r.model.replace("claude-", "")} ${r.ok ? `${f0(r.totals!.calories)} kcal` : `ERROR ${r.error}`}`).join(" | "),
    );
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const report = buildReport(runs, models, usable, truth);
  writeFileSync(join(folder, `compare-${stamp}.md`), report);
  writeFileSync(join(folder, `compare-${stamp}.json`), JSON.stringify({ models, lang, truth, runs }, null, 2));
  console.log("\n" + report);
  console.log(`Saved compare-${stamp}.md and .json in ${folder}`);
}

function cost(model: string, usage: { input_tokens: number; output_tokens: number }) {
  const [inP, outP] = PRICES[model] ?? [NaN, NaN];
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cost: (usage.input_tokens * inP + usage.output_tokens * outP) / 1e6,
  };
}

export function buildReport(runs: Run[], models: string[], photos: string[], truth: Record<string, Partial<Totals>>): string {
  const ref = models[0];
  const get = (photo: string, model: string) => runs.find((r) => r.photo === photo && r.model === model);
  const lines: string[] = [];

  lines.push("# Model comparison", "", `Reference: **${ref}**. ${photos.length} photos.`, "");
  lines.push("## Summary", "");
  lines.push("| Model | Errors | Avg cost / scan | Cost per 1,000 scans | Median time | Calories off vs reference (avg) | Within ±15% kcal | Protein / carbs / fat off (avg) |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const model of models) {
    const mine = runs.filter((r) => r.model === model);
    const ok = mine.filter((r) => r.ok);
    const avgCost = mean(mine.map((r) => r.cost));
    const diffs: Record<string, number[]> = { calories: [], protein: [], carbs: [], fat: [] };
    let within = 0;
    let compared = 0;
    if (model !== ref) {
      for (const r of ok) {
        const base = get(r.photo, ref);
        if (!base?.ok || !base.isFood || !r.isFood) continue;
        compared++;
        for (const k of NUTRIENTS) {
          const d = pctOff(r.totals![k], base.totals![k]);
          if (d !== null) diffs[k].push(d);
        }
        if ((pctOff(r.totals!.calories, base.totals!.calories) ?? 100) <= 15) within++;
      }
    }
    lines.push(
      `| ${model} | ${mine.length - ok.length} | ${usd(avgCost)} | ${Number.isFinite(avgCost) ? `$${(avgCost * 1000).toFixed(2)}` : "–"} | ${f1(median(ok.map((r) => r.seconds)))} s | ` +
        (model === ref
          ? "reference | – | – |"
          : `${f0(mean(diffs.calories))}% | ${compared ? `${within}/${compared}` : "–"} | ${f0(mean(diffs.protein))}% / ${f0(mean(diffs.carbs))}% / ${f0(mean(diffs.fat))}% |`),
    );
  }

  const truthPhotos = photos.filter((p) => truth[p]?.calories);
  if (truthPhotos.length) {
    lines.push("", `## Against the real values (truth.json, ${truthPhotos.length} photos)`, "");
    lines.push("| Model | Calories off (avg) | Within ±15% | Protein / carbs / fat off (avg) |", "|---|---|---|---|");
    for (const model of models) {
      const diffs: Record<string, number[]> = { calories: [], protein: [], carbs: [], fat: [] };
      let within = 0;
      for (const p of truthPhotos) {
        const r = get(p, model);
        if (!r?.ok) continue;
        for (const k of NUTRIENTS) {
          const t = truth[p][k];
          const d = t === undefined ? null : pctOff(r.totals![k], t);
          if (d !== null) diffs[k].push(d);
        }
        if ((pctOff(r.totals!.calories, truth[p].calories!) ?? 100) <= 15) within++;
      }
      lines.push(`| ${model} | ${f0(mean(diffs.calories))}% | ${within}/${truthPhotos.length} | ${f0(mean(diffs.protein))}% / ${f0(mean(diffs.carbs))}% / ${f0(mean(diffs.fat))}% |`);
    }
  }

  lines.push("", "## Each photo", "");
  lines.push(`| Photo | ${models.map((m) => `${m.replace("claude-", "")} kcal (P/C/F)`).join(" | ")}${truthPhotos.length ? " | Real" : ""} |`);
  lines.push(`|---|${models.map(() => "---").join("|")}|${truthPhotos.length ? "---|" : ""}`);
  for (const p of photos) {
    const cells = models.map((m) => {
      const r = get(p, m);
      if (!r) return "–";
      if (!r.ok) return `error: ${r.error}`;
      if (!r.isFood) return "not food";
      const t = r.totals!;
      return `${f0(t.calories)} (${f0(t.protein)}/${f0(t.carbs)}/${f0(t.fat)})`;
    });
    const real = truth[p]?.calories ? ` | ${truth[p].calories}` : truthPhotos.length ? " | –" : "";
    lines.push(`| ${p} | ${cells.join(" | ")}${real} |`);
  }

  lines.push("", "## What each model saw", "");
  for (const p of photos) {
    lines.push(`**${p}**`);
    for (const m of models) {
      const r = get(p, m);
      lines.push(`- ${m}: ${r?.ok ? (r.items?.length ? r.items.join("; ") : "(nothing)") : `error: ${r?.error}`}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

if (process.argv[1]?.endsWith("compare-models.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
