const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';

const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

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
    return jsonResponse({ error: 'Free-tier rate limit reached: ' + RATE_LIMIT + ' requests per minute. Please wait and try again.' }, 429);
  }

  try {
    const { contents, system_instruction } = await request.json();

    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      return jsonResponse({ error: 'Missing or invalid contents array.' }, 400);
    }

    const body = {
      contents,
      generationConfig: { maxOutputTokens: 1200, temperature: 0.4 },
    };

    if (system_instruction) {
      body.system_instruction = system_instruction;
    }

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
