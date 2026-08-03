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
Every answer is grounded in the **live Google Sheet**, fetched at the moment of
each question. There is no hardcoded or cached catalogue.

## Architecture

```
GitHub Pages (static frontend)          Cloudflare Worker (proxy)          Gemini API
index.html, styles.css, app.js  ->  worker/worker.js (secret key) ->  gemini-3.5-flash-lite
                                          |
                                          v
                          Live Google Sheet (published CSV, fetched per request)
```

1. **Frontend** (this repo, root files): a no-build chat UI served from GitHub Pages.
   It keeps the conversation history in the browser and sends the full thread to
   the Worker on each message, so the model always sees context.
2. **Proxy** (`worker/worker.js`): a Cloudflare Worker that holds the Gemini API
   key as a secret binding (never shipped to the browser), adds CORS, forwards the
   conversation to Gemini, maps errors, and enforces the free-tier limit of 15
   requests per minute.
3. **Live data**: on every request the Worker fetches the Google Sheet as CSV
   (`gviz/tq?tqx=out:csv`), parses it, and injects the current rows into the
   model's system instruction. Nothing is copied, cached, or stored. If the sheet
   is unreachable, the chatbot says so instead of answering from stale data.
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
worker/                 Cloudflare Worker proxy (fetches the live Google Sheet)
index.html, styles.css, app.js   GitHub Pages frontend (served from the repo root)
agent-persona-template.md   the persona scaffold (source)
five-innovators-spec.md     the five-innovators spec (source)
```

The live catalogue is a Google Sheet (single source of truth). The Worker fetches
it on every request; see `SHEET_URL` in `worker/worker.js` to point it at a
different sheet.

## Running it yourself

The worker requires a Gemini API key from https://aistudio.google.com (free tier):

```bash
# deploy the worker
npx wrangler deploy worker/worker.js --name rockwell-api
# set the key as a secret binding
npx wrangler secret put GEMINI_API_KEY --name rockwell-api
```

The frontend is plain static files served from the repo root; open `index.html`
locally or serve from any static host. Set `WORKER_URL` in `app.js` to your
worker's `https://rockwell-api.<subdomain>.workers.dev` URL.

## Notes

- Free tier: 15 requests per minute, enforced client-side and server-side.
- Prices in the catalogue are indicative, as the business case is a demonstration.
- Conversation history is kept in the browser and sent with each request, so a
  page refresh resets the thread.
