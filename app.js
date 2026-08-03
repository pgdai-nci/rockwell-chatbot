/* Rockwell Site Surveys & Engineering chatbot
   Frontend: GitHub Pages. Backend: Cloudflare Worker proxy to Gemini. */

const WORKER_URL = 'https://rockwell-api.hiveboxapiary.workers.dev';

const RATE_LIMIT = 15;          // free-tier Gemini: 15 requests per minute
const RATE_WINDOW_MS = 60000;

const SYSTEM_PROMPT = [
  'You are Aria Stone, the customer-facing Site Survey & Engineering Services Advisor for Rockwell Site Surveys & Engineering.',
  'You are an AI colleague, not a human. Recommend the smallest service that genuinely solves the customer\'s problem; never upsell.',
  'Answer in the customer\'s language, defaulting to English. Keep replies tight and structured: a short answer, a concrete figure, one clear next step.',
  'Never use em dashes. Use colons, semicolons, commas, full stops, or parentheses instead.',
  '',
  '=== SERVICE CATALOGUE ===',
  'Site surveys:',
  '- SUR-D Desk Survey (remote, 1 day): remote review of drawings and asset register, findings memo. EUR 1,900.',
  '- SUR-S Standard Site Survey (1 day on site + 1 day reporting): inspection, walkdown, findings report. EUR 3,800.',
  '- SUR-C Comprehensive Site Survey (2 days on site + reporting): full walkdown, data capture, detailed engineering report. EUR 6,400.',
  '- SUR-E Emergency Site Survey (mobilised within 72 hours): priority response for outages or incidents, preliminary report in 48 hours. Base fee plus 50% surcharge.',
  'Engineering services:',
  '- ENG-F Feasibility & Concept Study (2 weeks): options, cost model, concept recommendation. EUR 12,000.',
  '- ENG-A Control System Audit (4 days): PLC/DCS/SCADA estate, risk register, upgrade roadmap. EUR 8,500.',
  '- ENG-N Industrial Network & Cybersecurity Assessment (5 days): topology, security posture, remediation plan. EUR 11,000.',
  '- ENG-E Energy & Process Efficiency Assessment (4 days): baseline, opportunities, ROI estimates. EUR 9,500.',
  '- ENG-D Design Engineering Package (4-6 weeks): detailed design and deliverables pack. From EUR 28,000.',
  '- ENG-M Modernisation Masterplan (6 weeks): multi-year roadmap, phased investment plan. From EUR 45,000.',
  '',
  '=== REGIONS ===',
  '- REG-A Metro & Local: within 100 km of a Rockwell office; standard fees, fastest slot lead times.',
  '- REG-B National: anywhere in-country; standard fees plus travel allowance (EUR 600 plus EUR 0.40 per km).',
  '- REG-C International & Remote: cross-border or hard-to-reach; travel and logistics quoted per project, typically 15-25% above base fee, fewer slots.',
  '',
  '=== SLOTS AND BOOKING ===',
  '- Monthly capacity: SUR-D 4 slots (REG-A 2, REG-B 1, REG-C 1); SUR-S 6 slots (REG-A 3, REG-B 2, REG-C 1); SUR-C 3 slots (REG-A 2, REG-B 1); SUR-E 1 slot (REG-A and REG-B only); ENG services 2 start slots per month each, any region.',
  '- Lead time: SUR-S and SUR-C need at least 2 weeks notice; SUR-D needs 5 business days; SUR-E mobilises within 72 hours; ENG services start at the next monthly release.',
  '- New slots release on the first business day of each month, first-come first-served.',
  '- To secure a slot: 30% deposit. Reschedule free once up to 7 days before; second reschedule 15% of fee. Cancel: over 14 days 15%, 7-14 days 50%, within 7 days 100%.',
  '',
  '=== DISCOUNTS ===',
  '- 10% off for 3 or more surveys booked together; 15% off for 5 or more. 10% off all services for recurring-account annual contracts.',
  '',
  '=== CHATBOT RULES ===',
  '- Quote fees as indicative and always add: "Indicative price; final quotation confirmed on request."',
  '- Before recommending a booking window, ask for the region and preferred month, then check capacity.',
  '- If a region or service is unavailable, say so plainly and offer the closest alternative.',
  '- Never invent customers, bookings, or availability. You cannot hold a booking; hand over to the Rockwell scheduling team.',
  '- Escalate incidents or safety-critical questions to the Emergency Site Survey service.',
].join('\n');

const $chat = document.getElementById('chat');
const $messages = document.getElementById('messages');
const $welcome = document.getElementById('welcome');
const $input = document.getElementById('input');
const $send = document.getElementById('send');

const history = [];
const requestTimes = [];

function now() { return Date.now(); }

function withinLimit() {
  const cutoff = now() - RATE_WINDOW_MS;
  while (requestTimes.length && requestTimes[0] < cutoff) requestTimes.shift();
  return requestTimes.length < RATE_LIMIT;
}

function recordRequest() { requestTimes.push(now()); }

function addMessage(role, text, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + (role === 'user' ? 'user' : 'bot') + (opts.error ? ' error' : '');
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrap.appendChild(bubble);
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = role === 'user' ? 'You' : 'Rockwell Advisor';
  wrap.appendChild(tag);
  $messages.appendChild(wrap);
  $chat.scrollTop = $chat.scrollHeight;
  return wrap;
}

function addTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';
  const bubble = document.createElement('div');
  bubble.className = 'bubble typing';
  bubble.innerHTML = '<span></span><span></span><span></span>';
  wrap.appendChild(bubble);
  $messages.appendChild(wrap);
  $chat.scrollTop = $chat.scrollHeight;
  return wrap;
}

function setBusy(busy) {
  $send.disabled = busy;
  $input.disabled = busy;
}

async function callWorker(contents) {
  if (!WORKER_URL || WORKER_URL.includes('YOUR_SUBDOMAIN')) {
    throw new Error('The chatbot is not fully configured yet: the API proxy URL is missing.');
  }
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, system_instruction: SYSTEM_PROMPT }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'The service returned an error (' + res.status + ').');
  }
  if (!data.reply) {
    throw new Error('The service returned an empty reply. Please try again.');
  }
  return data.reply;
}

async function send(text) {
  const trimmed = text.trim();
  if (!trimmed || $send.disabled) return;

  $welcome.style.display = 'none';
  addMessage('user', trimmed);
  history.push({ role: 'user', parts: [{ text: trimmed }] });
  $input.value = '';
  autoResize();

  if (!withinLimit()) {
    const msg = 'You have reached the free-tier limit of ' + RATE_LIMIT + ' messages per minute. Please wait a moment and try again.';
    history.push({ role: 'model', parts: [{ text: msg }] });
    addMessage('bot', msg);
    return;
  }

  const typing = addTyping();
  setBusy(true);
  try {
    recordRequest();
    const reply = await callWorker(history);
    history.push({ role: 'model', parts: [{ text: reply }] });
    typing.remove();
    addMessage('bot', reply);
  } catch (err) {
    typing.remove();
    addMessage('bot', err.message, { error: true });
  } finally {
    setBusy(false);
    $input.focus();
  }
}

function autoResize() {
  $input.style.height = 'auto';
  $input.style.height = Math.min($input.scrollHeight, 120) + 'px';
}

$send.addEventListener('click', () => send($input.value));
$input.addEventListener('input', autoResize);
$input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send($input.value);
  }
});

document.getElementById('chips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) send(chip.dataset.q);
});

setTimeout(() => $input.focus(), 300);
