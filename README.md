# Rockwell Site Surveys & Engineering Chatbot

A Gemini-powered chatbot for the Rockwell Site Surveys & Engineering business
case: helping plant owners, maintenance managers, and engineering leads find the
right site survey or engineering service, with fees, regions, and slot
availability, all from one chat window.

- **Live chatbot:** https://pgdai-nci.github.io/rockwell-chatbot/
- **Repo:** https://github.com/pgdai-nci/rockwell-chatbot

## What it does

The chatbot acts as Aria Stone, the Rockwell Site Survey & Engineering Services
Advisor. It answers questions about the services catalogue, quotes fees, explains
availability and slots, and points out when a service is not in the catalogue.
Every answer is grounded in two **live sources**, both fetched at the moment of
each question and combined into a single reply:

1. **Google Sheet** - the services catalogue (fees, regions, slots, offers).
2. **USGS Earthquake API** - recent seismic activity in the Ireland region,
   used as evidence for structural and pre-purchase inspections: an event near a
   customer's area justifies prioritising a survey, and "no recent activity" is
   plain reassurance.

There is no hardcoded or cached catalogue.

## Architecture

```
GitHub Pages (static frontend)                      Cloudflare Worker (thin proxy)      Gemini API
index.html, styles.css, data.js, app.js  ->  worker/index.js (secret key)  ->  gemini-3.5-flash-lite
       |                                                    |
       +-------- Live Google Sheet (catalogue, JSONP) -------+---- (no CORS on the sheet,
       +-------- USGS Earthquake API (seismic, JSON, CORS) -------   so it loads via JSONP)
```

1. **Frontend** (this repo, root files): a no-build chat UI served from GitHub
   Pages. It keeps the conversation history in the browser, fetches the two live
   sources (Google Sheet via JSONP, USGS via CORS JSON), builds the persona and
   system instruction, and sends the full thread to the Worker on each message.
2. **Proxy** (`worker/index.js`): a minimal Cloudflare Worker that holds the
   Gemini API key as a secret binding (never shipped to the browser), adds CORS,
   forwards whatever `contents` and `system_instruction` the client sends to
   Gemini, maps errors, and enforces the free-tier limit of 15 requests per
   minute.
3. **Live data**: fetched in the browser, not cached. The Google Sheet is read
   through its `gviz/tq?tqx=out:json` JSONP endpoint (the CSV endpoint sends no
   CORS headers, so JSONP is used instead); the USGS feed covers the Ireland
   region (past 90 days, magnitude >= 1.0, mapped to the nearest Rockwell
   region). Both are injected into the model's system instruction, which the
   Worker passes through untouched. If the sheet is unreachable the chatbot says
   so instead of answering from stale data; if USGS is unreachable it says it
   could not check seismic activity and still answers from the catalogue.
4. **LLM**: Google Gemini via the `:generateContent` endpoint (per the Google AI
   Studio instructions: lightweight model, chat loop, free tier). The model is
   `gemini-3.5-flash-lite`; the original 2.5 Flash in the instructions is no
   longer available to new keys, so the current lightweight free-tier model is used.

## The five custom agents

Built from `agent-persona-template.md` (the persona scaffold) and
`five-innovators-spec.md` (the cast), in `agents/`:

| Agent | Archetype | Lane |
|-------|-----------|------|
| `AriaStone-Advisor.md` | Business domain expert | Customer-facing advisor (the chatbot's voice) |
| `MarcusReid-Analyst.md` | Researcher & Analyst | Catalogue pricing and capacity intelligence |
| `SofiaChen-Designer.md` | Designer | Conversation flow and customer experience |
| `DiegoTorres-Maker.md` | Maker | Chatbot build: frontend, proxy, Gemini wiring |
| `ElenaWagner-Manager.md` | Manager | Build orchestration and quality gates |

They read like colleagues on one team: shared values, distinct lanes, no overlap.

## Project layout

```
agents/                 five custom agent personas
worker/                 thin Cloudflare Worker proxy (worker/index.js + wrangler.toml)
.github/workflows/      deploy-worker.yml: auto-deploys the Worker on push
index.html, styles.css, data.js, app.js   GitHub Pages frontend (repo root)
agent-persona-template.md   the persona scaffold (source)
five-innovators-spec.md     the five-innovators spec (source)
```

The live catalogue is a Google Sheet (single source of truth), read from the
browser on every question; see `SHEET_ID` in `data.js` to point it at a
different sheet.

## Running it yourself

The worker requires a Gemini API key from https://aistudio.google.com (free tier):

```bash
cd worker
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
```

The GitHub Actions workflow (`.github/workflows/deploy-worker.yml`) deploys the
worker automatically on every push to `worker/**`, provided the repo has a
`CLOUDFLARE_API_TOKEN` secret set.

The frontend is plain static files served from the repo root; open `index.html`
locally or serve from any static host. Set `WORKER_URL` in `app.js` to your
worker's `https://rockwell-api.<subdomain>.workers.dev` URL.

## Notes

- Free tier: 15 requests per minute, enforced client-side and server-side.
- Prices in the catalogue are indicative, as the business case is a demonstration.
- Conversation history is kept in the browser and sent with each request, so a
  page refresh resets the thread.
