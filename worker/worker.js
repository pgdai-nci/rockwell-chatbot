/* Rockwell chatbot API proxy.
   Serves the GitHub Pages frontend. Holds the Gemini API key as a secret
   binding (GEMINI_API_KEY), adds CORS, and guards the free tier.

   Knowledge: there is no hardcoded catalogue. On every request this Worker
   fetches the live Google Sheet (published as CSV) and injects its current
   contents into the model's system instruction, so the chatbot answers only
   from data fetched at the moment of each question. Nothing is copied, cached,
   or stored. */

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';

/* Live Google Sheet, served as CSV by Google. Read fresh on every request. */
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1UtwQFTXwg3YNj5OYP3MYWvanMPdG97kk7UNRthwEXRU/gviz/tq?tqx=out:csv';

const RATE_LIMIT = 15;          // free-tier Gemini ceiling
const RATE_WINDOW_MS = 60000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/* Static persona and rules. No catalogue data lives here. */
const PERSONA = [
  'You are Aria Stone, the customer-facing Site Survey & Engineering Services Advisor for Rockwell Site Surveys & Engineering.',
  'You are an AI colleague, not a human. You answer strictly from the live catalogue data block at the end of this instruction.',
  '',
  'Rules:',
  '- Answer ONLY from the live data block. Never invent services, prices, availability, slots, offers, or details that are not present in it.',
  '- If the answer is not in the data, say you cannot find it in the current catalogue and ask one focused question to narrow it down.',
  '- Recommend the service that best fits the customer\'s stated need based only on the data; never upsell beyond what the data supports.',
  '- Quote fees exactly as shown in the data and note they are indicative; the final quotation is confirmed by the Rockwell team.',
  '- Use the "description", "special_offer", and "availability" columns to give useful, data-backed detail.',
  '- Keep replies tight and structured: a short answer, the relevant figures from the data, one clear next step.',
  '- Answer in the customer\'s language, defaulting to English.',
  '- Never use em dashes. Use colons, semicolons, commas, full stops, or parentheses instead.',
  '',
].join('\n');

const buckets = new Map();

function checkLimit(ip) {
  const now = Date.now();
  const entry = buckets.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart >= RATE_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  buckets.set(ip, entry);
  return entry.count <= RATE_LIMIT;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

/* Minimal RFC-4180-style CSV parser (handles quotes and embedded commas). */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some(cell => cell !== '')) rows.push(row);
  }
  return rows;
}

async function fetchSheetRows() {
  const res = await fetch(SHEET_URL, { headers: { 'Accept': 'text/csv' } });
  if (!res.ok) {
    throw new Error('The live services sheet is unreachable right now (HTTP ' + res.status + '). Please try again shortly.');
  }
  const text = await res.text();
  const rows = parseCSV(text);
  if (rows.length < 2) {
    throw new Error('The live services sheet returned no catalogue rows. Please check the sheet and try again.');
  }
  return rows;
}

function buildSheetText(rows) {
  return rows
    .map(row => row.map(cell => String(cell == null ? '' : cell).trim()).join(' | '))
    .join('\n');
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed. Send POST with JSON.' }, 405);
  }

  const apiKey = GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'Server configuration error: Gemini API key is not set on this Worker.' }, 500);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkLimit(ip)) {
    return jsonResponse({
      error: 'Free-tier rate limit reached: ' + RATE_LIMIT + ' requests per minute. Please wait and try again.',
    }, 429);
  }

  try {
    const { contents } = await request.json();

    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      return jsonResponse({ error: 'Missing or invalid contents array.' }, 400);
    }

    /* Fetch the live sheet data for THIS question. No caching. */
    const rows = await fetchSheetRows();
    const sheetText = buildSheetText(rows);
    const fetchedAt = new Date().toISOString();

    const systemInstruction = PERSONA +
      '=== LIVE CATALOGUE DATA ===\n' +
      'Fetched from the Google Sheet at ' + fetchedAt + '.\n' +
      'Columns: service_id | service_name | category | region | fee_eur | duration_days | requires_site_visit | availability | slots_this_week | special_offer | description\n' +
      sheetText;

    const body = {
      contents,
      generationConfig: { maxOutputTokens: 1200, temperature: 0.4 },
      system_instruction: { parts: [{ text: systemInstruction }] },
    };

    const url = GEMINI_URL + '?key=' + encodeURIComponent(apiKey);
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = data.error?.message || 'Gemini API error: HTTP ' + geminiRes.status;
      if (geminiRes.status === 429) {
        return jsonResponse({ error: 'Free-tier rate limit reached: please wait a moment and try again.' }, 429);
      }
      return jsonResponse({ error: msg }, geminiRes.status);
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!reply) {
      return jsonResponse({ error: 'Empty response from the model. Please try again.' }, 502);
    }

    return jsonResponse({ reply });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}
