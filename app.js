/* Rockwell Site Surveys & Engineering chatbot
   Frontend: GitHub Pages. Backend: Cloudflare Worker proxy to Gemini. */

const WORKER_URL = 'https://rockwell-api.hiveboxapiary.workers.dev';

const RATE_LIMIT = 15;          // free-tier Gemini: 15 requests per minute
const RATE_WINDOW_MS = 60000;

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

async function callWorker(contents, systemInstruction) {
  if (!WORKER_URL || WORKER_URL.includes('YOUR_SUBDOMAIN')) {
    throw new Error('The chatbot is not fully configured yet: the API proxy URL is missing.');
  }
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      system_instruction: { parts: [{ text: systemInstruction }] },
    }),
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
    const systemInstruction = await ROCKWELL.buildSystemInstruction();
    const reply = await callWorker(history, systemInstruction);
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
