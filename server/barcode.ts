import { offFields, productToFood, type BarcodeProduct } from "../shared/barcode.ts";

// Looks products up on Open Food Facts. Answers are cached in memory, so popular products
// (and repeated scans of the same one) don't hit their servers again.

const API = "https://world.openfoodfacts.org/api/v2/product";
// Open Food Facts asks apps to identify themselves.
const USER_AGENT = "FoodTrack/0.1 (calorie tracker; https://github.com/lewrichard/foodtrack)";
const FOUND_TTL = 24 * 60 * 60 * 1000;
const MISSING_TTL = 60 * 60 * 1000;
const MAX_CACHE = 2000;

export class BarcodeLookupError extends Error {}

type Fetch = typeof fetch;

export class BarcodeLookup {
  private cache = new Map<string, { at: number; value: BarcodeProduct | null }>();

  constructor(private readonly fetchImpl: Fetch = fetch) {}

  /** The product, or null when Open Food Facts doesn't know the code. Throws when the service can't be reached. */
  async find(code: string, lang: string, now = Date.now()): Promise<BarcodeProduct | null> {
    const key = `${code}:${lang}`;
    const hit = this.cache.get(key);
    if (hit && now - hit.at < (hit.value ? FOUND_TTL : MISSING_TTL)) return hit.value;

    let res: Response;
    try {
      res = await this.fetchImpl(`${API}/${code}.json?fields=${offFields(lang)}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      throw new BarcodeLookupError(`Open Food Facts unreachable: ${e instanceof Error ? e.message : e}`);
    }
    let value: BarcodeProduct | null = null;
    if (res.status === 404) {
      value = null;
    } else if (!res.ok) {
      throw new BarcodeLookupError(`Open Food Facts answered ${res.status}`);
    } else {
      const body = (await res.json().catch(() => null)) as { status?: number; product?: Record<string, unknown> } | null;
      value = body?.product && body.status !== 0 ? productToFood(code, body.product, lang) : null;
    }

    if (this.cache.size >= MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { at: now, value });
    return value;
  }
}
