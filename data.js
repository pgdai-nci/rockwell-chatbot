const ROCKWELL = (function () {
  const SHEET_ID = '1UtwQFTXwg3YNj5OYP3MYWvanMPdG97kk7UNRthwEXRU';
  const SHEET_JSONP = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:json;responseHandler:__rockwellSheet';

  const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
  const SEISMIC_DAYS = 90;
  const SEISMIC_MIN_MAG = 1.0;
  const IRELAND_LAT = 53.5;
  const IRELAND_LON = -8.0;
  const IRELAND_RADIUS_KM = 400;

  const REGION_COORDS = {
    'Sligo':        [54.2766, -8.4761],
    'Wexford':      [52.3366, -6.4633],
    'Galway':       [53.2707, -9.0568],
    'Kildare':      [53.1561, -6.9084],
    'Cork Harbour': [51.8470, -8.2991],
    'Mayo':         [53.8486, -9.2988],
    'Donegal':      [54.6540, -8.1104],
  };

  const PERSONA = [
    'You are Aria Stone, the customer-facing Site Survey & Engineering Services Advisor for Rockwell Site Surveys & Engineering.',
    'You are an AI colleague, not a human. You answer strictly from the live data blocks at the end of this instruction.',
    '',
    'Rules:',
    '- Answer ONLY from the live data blocks. Never invent services, prices, availability, slots, offers, seismic events, or details that are not present in them.',
    "- If the answer is not in the data, say you cannot find it in the current catalogue and ask one focused question to narrow it down.",
    "- Recommend the service that best fits the customer's stated need based only on the data; never upsell beyond what the data supports.",
    '- Quote fees exactly as shown in the data and note they are indicative; the final quotation is confirmed by the Rockwell team.',
    '- Use the "description", "special_offer", and "availability" columns to give useful, data-backed detail.',
    '',
    'Seismic activity (from the LIVE SEISMIC ACTIVITY block):',
    "- Use it to strengthen answers about structural and pre-purchase inspections, and to address customer concerns about their property.",
    "- If an event is listed near the customer's region: cite its magnitude, date, and location as evidence, and recommend prioritising a structural inspection that checks for quake-related cracking, settlement, or movement.",
    '- If the block reports no recent activity: say so plainly, as reassurance, and keep the structural inspection on offer for peace of mind.',
    '- If the block says seismic data was unavailable, tell the customer you could not check seismic activity; never pretend you checked.',
    '- Never claim damage or risk that is not stated in the data. The seismic block is evidence, not a prediction.',
    '',
    'Keep replies tight and structured: a short answer, the relevant figures from the data, one clear next step. Combine both data blocks into a single reply whenever both are relevant.',
    "- Answer in the customer's language, defaulting to English.",
    '- Never use em dashes. Use colons, semicolons, commas, full stops, or parentheses instead.',
    '',
  ].join('\n');

  function loadSheet() {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = SHEET_JSONP;
      s.onerror = function () {
        window.__rockwellSheet = null;
        reject(new Error('The live services sheet is unreachable right now. Please try again shortly.'));
      };
      window.__rockwellSheet = function (payload) {
        resolve(payload);
      };
      document.head.appendChild(s);
    });
  }

  function sheetToText(payload) {
    const table = payload && payload.table;
    if (!table || !table.rows || !table.rows.length) {
      throw new Error('The live services sheet returned no catalogue rows. Please check the sheet and try again.');
    }
    const cols = (table.cols || []).map(function (c) {
      return (c && (c.label || c.id)) || '';
    });
    const rows = table.rows.map(function (r) {
      const cells = (r && r.c) || [];
      return cells.map(function (cell) {
        if (!cell || typeof cell !== 'object' || cell.v == null) return '';
        return String(cell.v);
      }).join(' | ');
    });
    return cols.join(' | ') + '\n' + rows.join('\n');
  }

  async function fetchSheetText() {
    return sheetToText(await loadSheet());
  }

  function haversineKm(lon1, lat1, lon2, lat2) {
    const toRad = function (d) { return (d * Math.PI) / 180; };
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
    for (const region in REGION_COORDS) {
      const coords = REGION_COORDS[region];
      const km = haversineKm(lon, lat, coords[1], coords[0]);
      if (km < bestKm) {
        bestKm = km;
        best = region;
      }
    }
    return { region: best, km: Math.round(bestKm) };
  }

  async function fetchSeismicText() {
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
      .map(function (f) {
        return {
          time: f.properties && f.properties.time,
          mag: f.properties && f.properties.mag,
          place: f.properties && f.properties.place,
          depth: (f.geometry && f.geometry.coordinates && f.geometry.coordinates[2]) || 0,
          lon: f.geometry && f.geometry.coordinates && f.geometry.coordinates[0],
          lat: f.geometry && f.geometry.coordinates && f.geometry.coordinates[1],
        };
      })
      .filter(function (e) { return e.time && e.lon != null && e.lat != null; })
      .sort(function (a, b) { return a.time - b.time; });

    if (events.length === 0) {
      return 'No seismic events with magnitude >= ' + SEISMIC_MIN_MAG +
        ' were recorded in the Ireland region in the past ' + SEISMIC_DAYS +
        ' days. Say so plainly as reassurance, and keep structural inspections on offer for peace of mind.';
    }

    return 'Earthquakes recorded in the Ireland region in the past ' + SEISMIC_DAYS + ' days (USGS):\n' +
      events.map(function (e) {
        const date = new Date(e.time).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
        const near = nearestRegion(e.lon, e.lat);
        return '- Magnitude ' + e.mag + ' at ' + date + ', ' + e.place +
          ' (depth ' + Math.round(e.depth) + ' km; nearest Rockwell region: ' + near.region + ', about ' + near.km + ' km away)';
      }).join('\n');
  }

  async function buildSystemInstruction() {
    const fetchedAt = new Date().toISOString();
    const [sheetText, seismicText] = await Promise.all([fetchSheetText(), fetchSeismicText()]);
    return PERSONA +
      '=== LIVE CATALOGUE DATA ===\n' +
      'Fetched from the Google Sheet at ' + fetchedAt + '.\n' +
      'Columns: service_id | service_name | category | region | fee_eur | duration_days | requires_site_visit | availability | slots_this_week | special_offer | description\n' +
      sheetText + '\n\n' +
      '=== LIVE SEISMIC ACTIVITY ===\n' +
      'Fetched from the USGS Earthquake API at ' + fetchedAt + ' (Ireland region).\n' +
      seismicText;
  }

  return { buildSystemInstruction };
})();
