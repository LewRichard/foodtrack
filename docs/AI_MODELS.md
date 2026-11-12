# Choosing the AI model for meal logging

Photo scans and typed/spoken meals are the most frequent AI calls, so they use their own model,
set with `SCAN_MODEL` (empty = `claude-opus-5-5`). Lew, meal plans and weekly reports always use
Opus 5.5. `/api/health` shows both (`model`, `scanModel`).

Rough cost per photo scan (prices per million tokens: Opus 5.5 $4 in / $20 out,
Sonnet 5.5 $2 / $10, Haiku 5.5 $0.10 / $0.50):

| `SCAN_MODEL` | About per scan |
|---|---|
| `claude-opus-5-5` (default) | $0.04–0.06 |
| `claude-sonnet-5-5` | $0.02–0.03 |
| `claude-haiku-5-5` | $0.001–0.002 |

Haiku has no server-side refusal fallback, so the request is sent without `fallbacks` for it.

## Compare before switching

`scripts/compare-models.ts` sends the same photos to several models and reports calories, macros,
speed and cost per scan. Every call is real and billed (about $0.05 per photo for Opus + Haiku);
the script shows an estimate and asks before it starts.

1. Put 20–30 meal photos (JPG/PNG/WebP, under 5 MB) in `eval-photos/` at the project root
   (ignored by git). Mix home food, restaurant plates, drinks, snacks and packaged food.
2. Optional, for real accuracy: add `eval-photos/truth.json` with known values, e.g. from a
   nutrition label or food you weighed:
   ```json
   { "yogurt.jpg": { "calories": 150, "protein": 6, "carbs": 20, "fat": 4 } }
   ```
3. Make sure `.env` has `ANTHROPIC_API_KEY`, then run:
   ```
   npm run compare-models -- eval-photos --lang vi
   ```
   Other models: `--models claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5`.
4. Read `eval-photos/compare-<time>.md`. The first model is the reference: the summary shows how
   far the others are from it on average and how many photos land within ±15% calories.

Without `truth.json` this measures how close Haiku is to Opus, not who is right; Opus can be
wrong too. A few photos with real values make the comparison much more meaningful.

## Switching

On Render → Environment, set `SCAN_MODEL` to `claude-haiku-5-5` and save (the service restarts).
To go back, clear the value.
