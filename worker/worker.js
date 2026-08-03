/* Rockwell chatbot API proxy.
   Serves the GitHub Pages frontend. Holds the Gemini API key as a secret
   binding (GEMINI_API_KEY), adds CORS, and guards the free tier.

   Knowledge: there is no hardcoded catalogue. On every request this Worker
   fetches two live sources and injects their current contents into the model's
   system instruction, so the chatbot answers only from data fetched at the
   moment of each question:
     1. the live Google Sheet (services catalogue, published as CSV), and
     2. the public USGS Earthquake API (recent seismic activity in Ireland),
   and combines both into a single reply. Nothing is copied, cached, or stored. */

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';

/* Live Google Sheet, served as CSV by Google. Read fresh on every request. */
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1UtwQFTXwg3YNj5OYP3MYWvanMPdG97kk7UNRthwEXRU/gviz/tq?tqx=out:csv';

/* Public USGS Earthquake API (open data, no key). Covers the island of Ireland
   plus nearby UK coast from a central point. Read fresh on every request. */
const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const SEISMIC_DAYS = 90;            // how far back to look for "recent" activity
const SEISMIC_MIN_MAG = 1.0;        // smaller events are irrelevant to surveys
const IRELAND_LAT = 53.5;           // central-Ireland query point
const IRELAND_LON = -8.0;
const IRELAND_RADIUS_KM = 400;

/* Approximate coordinates for each Rockwell region, so seismic events can be
   tied to the region a customer cares about. */
const REGION_COORDS = {
  'Sligo':         [54.2766, -8.4761],
  'Wexford':       [52.3366, -6.4633],
  'Galway':        [53.2707, -9.0568],
  'Kildare':       [53.1561, -6.9084],
  'Cork Harbour':  [51.8470, -8.2991],
  'Mayo':          [53.8486, -9.2988],
  'Donegal':       [54.6540, -8.1104],
};

const RATE_LIMIT = 15;          // free-tier Gemini ceiling
const RATE_WINDOW_MS = 60000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

/* Static persona and rules. No catalogue or seismic data lives here. */
const PERSONA = [
  'You are Aria Stone, the customer-facing Site Survey & Engineering Services Advisor for Rockwell Site Surveys & Engineering.',
  'You are an AI colleague, not a human. You answer strictly from the live data blocks at the end of this instruction.',
  '',
  'Rules:',
  '- Answer ONLY from the live data blocks. Never invent services, prices, availability, slots, offers, seismic events, or details that are not present in them.',
  '- If the answer is not in the data, say you cannot find it in the current catalogue and ask one focused question to narrow it down.',
  '- Recommend the service that best fits the customer\'s stated need based only on the data; never upsell beyond what the data supports.',
  '- Quote fees exactly as shown in the data and note they are indicative; the final quotation is confirmed by the Rockwell team.',
  '- Use the "description", "special_offer", and "availability" columns to give useful, data-backed detail.',
  '',
  'Seismic activity (from the LIVE SEISMIC ACTIVITY block):',
  '- Use it to strengthen answers about structural and pre-purchase inspections, and to address customer concerns about their property.',
  '- If an event is listed near the customer\'s region: cite its magnitude, date, and location as evidence, and recommend prioritising a structural inspection that checks for quake-related cracking, settlement, or movement.',
  '- If the block reports no recent activity: say so plainly, as reassurance, and keep the structural inspection on offer for peace of mind.',
  '- If the block says seismic data was unavailable, tell the customer you could not check seismic activity; never pretend you checked.',
  '- Never claim damage or risk that is not stated in the data. The seismic block is evidence, not a prediction.',
  '',
  'Keep replies tight and structured: a short answer, the relevant figures from the data, one clear next step. Combine both data blocks into a single reply whenever both are relevant.',
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

/* Great-circle distance in kilometres between two lon/lat pairs. */
function haversineKm(lon1, lat1, lon2, lat2) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestRegion(lon, lat) {
  let best = null;
  let bestKm = Infinity;
  for (const [region, coords] of Object.entries(REGION_COORDS)) {
    const km = haversineKm(lon, lat, coords[1], coords[0]);
    if (km < bestKm) {
      bestKm = km;
      best = region;
    }
  }
  return { region: best, km: Math.round(bestKm) };
}

/* Fetch recent seismic activity for the Ireland region from USGS. Always
   resolves: on success it returns the rendered events block, on failure it
   returns a status line so the chatbot stays honest. */
async function fetchSeismic() {
  const start = new Date(Date.now() - SEISMIC_DAYS * 86400000).toISOString().slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  const url = USGS_URL +
    '?format=geojson' +
    '&starttime=' + encodeURIComponent(start) +
    '&endtime=' + encodeURIComponent(end) +
    '&minmagnitude=' + SEISMIC_MIN_MAG +
    '&latitude=' + IRELAND_LAT +
    '&longitude=' + IRELAND_LON +
    '&maxradiuskm=' + IRELAND_RADIUS_KM +
    '&orderby=time';

  let data;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } catch (err) {
    return 'Seismic data was temporarily unavailable (USGS could not be reached). Tell the customer you could not check seismic activity, and answer from the catalogue data only.';
  }

  const events = (data.features || [])
    .map(f => ({
      time: f.properties && f.properties.time,
      mag: f.properties && f.properties.mag,
      place: f.properties && f.properties.place,
      depth: (f.geometry && f.geometry.coordinates && f.geometry.coordinates[2]) || 0,
      lon: f.geometry && f.geometry.coordinates && f.geometry.coordinates[0],
      lat: f.geometry && f.geometry.coordinates && f.geometry.coordinates[1],
    }))
    .filter(e => e.time && e.lon != null && e.lat != null)
    .sort((a, b) => a.time - b.time);

  if (events.length === 0) {
    return 'No seismic events with magnitude >= ' + SEISMIC_MIN_MAG +
      ' were recorded in the Ireland region in the past ' + SEISMIC_DAYS +
      ' days. Say so plainly as reassurance, and keep structural inspections on offer for peace of mind.';
  }

  return 'Earthquakes recorded in the Ireland region in the past ' + SEISMIC_DAYS + ' days (USGS):\n' +
    events.map(e => {
      const date = new Date(e.time).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
      const near = nearestRegion(e.lon, e.lat);
      return '- Magnitude ' + e.mag + ' at ' + date + ', ' + e.place +
        ' (depth ' + Math.round(e.depth) + ' km; nearest Rockwell region: ' + near.region + ', about ' + near.km + ' km away)';
    }).join('\n');
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

    /* Fetch the live data for THIS question. No caching. The sheet is required;
       USGS always resolves (to an unavailable-note if it fails). */
    const [rows, seismicText] = await Promise.all([fetchSheetRows(), fetchSeismic()]);
    const sheetText = buildSheetText(rows);
    const fetchedAt = new Date().toISOString();

    const systemInstruction = PERSONA +
      '=== LIVE CATALOGUE DATA ===\n' +
      'Fetched from the Google Sheet at ' + fetchedAt + '.\n' +
      'Columns: service_id | service_name | category | region | fee_eur | duration_days | requires_site_visit | availability | slots_this_week | special_offer | description\n' +
      sheetText + '\n\n' +
      '=== LIVE SEISMIC ACTIVITY ===\n' +
      'Fetched from the USGS Earthquake API at ' + fetchedAt + ' (Ireland region).\n' +
      seismicText;

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
