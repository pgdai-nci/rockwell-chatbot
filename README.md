# Rockwell Site Surveys & Engineering Chatbot

A Gemini-powered chatbot for the Rockwell Site Surveys & Engineering business
case: helping plant owners, maintenance managers, and engineering leads find the
right site survey or engineering service, with fees, regions, and slot
availability, all from one chat window.

- **Live chatbot:** https://pgdai-nci.github.io/rockwell-chatbot/
- **Repo:** https://github.com/pgdai-nci/rockwell-chatbot

## What it does

The chatbot acts as Aria Stone, the Rockwell Site Survey & Engineering Services
Advisor. It answers questions about the services catalogue (desk, standard,
comprehensive, and emergency site surveys plus six engineering studies), quotes
indicative fees, explains the three regions and their travel rules, checks slot
capacity and booking rules, and routes emergencies to the priority lane.

## Architecture

```
GitHub Pages (static frontend)          Cloudflare Worker (proxy)          Gemini API
index.html, styles.css, app.js  ->  worker/worker.js (secret key) ->  gemini-3.5-flash-lite
```

1. **Frontend** (this repo, root files): a no-build chat UI served from GitHub Pages.
   It keeps the conversation history in the browser and sends the full thread to
   the Worker on each message, so the model always sees context.
2. **Proxy** (`worker/worker.js`): a Cloudflare Worker that holds the Gemini API
   key as a secret binding (never shipped to the browser), adds CORS, forwards the
   conversation to Gemini, maps errors, and enforces the free-tier limit of 15
   requests per minute.
3. **LLM**: Google Gemini via the `:generateContent` endpoint (per the Google AI
   Studio instructions: lightweight model, chat loop, free tier). The model is
   `gemini-3.5-flash-lite`; the original 2.5 Flash in the instructions is no
   longer available to new keys, so the current lightweight free-tier model is used.

The system prompt embeds Aria's persona and the full catalogue knowledge base
(`knowledge/rockwell-site-surveys.md`), so the model answers from a single source
of truth and always labels prices as indicative.

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
knowledge/              the catalogue knowledge base (single source of truth)
worker/                 Cloudflare Worker proxy
index.html, styles.css, app.js   GitHub Pages frontend (served from the repo root)
agent-persona-template.md   the persona scaffold (source)
five-innovators-spec.md     the five-innovators spec (source)
```

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
