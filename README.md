# FoodTrack — AI calorie scanner & nutrition tracker

Take a photo of your meal, and FoodTrack identifies each food, estimates the portion size, and
returns calories, protein, carbs, fat, fiber, sugar and sodium. Review and adjust the estimate,
then log it to your daily diary and track progress against your goals.

It is a mobile-first web app (installable as a PWA on iOS/Android) with a small Node server that
calls Claude's vision model, so your API key never reaches the browser.

## Features

- **Camera scanning** – live camera viewfinder (rear camera on phones), or take/choose a photo.
  Add an optional note ("large portion", "cooked in butter") to improve the estimate.
- **Per-item breakdown** – each food on the plate is listed with portion, grams, calories and macros,
  plus a confidence flag. Adjust servings (0.25× steps), edit any value, remove or add items.
- **Daily diary** – breakfast / lunch / dinner / snacks, calorie ring, macro progress bars,
  fiber / sugar / sodium, water tracker, and navigation to previous days.
- **Manual logging** – search a built-in database of common foods, re-log recent foods in one tap,
  or enter a custom food.
- **Goals** – calculate targets from your profile (Mifflin-St Jeor BMR × activity, adjusted for
  lose / maintain / gain) or set them manually.
- **Trends** – 7- and 30-day calorie chart vs. goal, average macro split, daily log table.
- **Private by default** – your diary is stored in the browser's local storage. Export/import a JSON backup.

## Getting started

Requirements: Node.js 22+ and an [Anthropic API key](https://console.anthropic.com/).

```bash
npm install
cp .env.example .env        # then put your key in ANTHROPIC_API_KEY
npm run dev                 # API on :8787, web app on http://localhost:5173
```

To try it on your phone, open the dev server's network URL (`vite` prints it). Browsers only
allow the live camera on `https://` or `localhost`. On plain `http` over the LAN, the app falls
back to the phone's native camera through the "Take photo" button.

### Production

```bash
npm run build
npm start                   # serves the built app + API on http://localhost:8787
```

Deploy anywhere that runs Node (Render, Fly.io, Railway, a VPS…) behind HTTPS and set
`ANTHROPIC_API_KEY` in the environment.

## How it works

```
Browser (React PWA)                         Server (Express)                 Claude API
─────────────────────                       ────────────────                 ──────────
camera/photo → resize to ≤1568px JPEG  ──►  POST /api/analyze  ──►  claude-opus-5-5 vision
review & edit items  ◄──────────────────── validated JSON  ◄────── structured output (Zod schema)
log to localStorage diary
```

- `server/analyze.ts` sends the image to Claude with a dietitian-style system prompt and uses
  **structured outputs** (`betaZodOutputFormat`) so the response is always valid JSON matching the
  schema. Server-side refusal fallbacks are enabled (`fallbacks: "default"`).
- `shared/nutrition.ts` holds shared types and the nutrition math (totals, scaling, BMR/TDEE, goals).
- `src/` is the React app: `components/Scan.tsx` (camera + review), `Today.tsx` (diary),
  `History.tsx` (trends), `Settings.tsx` (goals & data).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API server (watch mode) + Vite dev server |
| `npm run build` | Typecheck and build the web app into `dist/` |
| `npm start` | Serve `dist/` and the API from one process |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |

## Disclaimer

Photo-based estimates are approximations (hidden oils, sauces and portion size are hard to see).
FoodTrack is not a medical device and does not give medical advice.
