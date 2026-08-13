// Same geocoding used by the dashboard's uploads, so WhatsApp-submitted
// properties land near their real micro-market instead of all stacking on
// one fallback point.
async function geocodeMarket(market, city) {
  const fallback = { lat: 18.52 + (Math.random() - 0.5) * 0.08, lng: 73.855 + (Math.random() - 0.5) * 0.08 };
  if (!market) return fallback;
  try {
    const q = encodeURIComponent(market + ', ' + (city || 'Pune') + ', India');
    const res = await fetch('https://nominatim.openstreetmap.org/search?q=' + q + '&format=json&limit=1');
    if (!res.ok) return fallback;
    const data = await res.json();
    if (data && data.length && data[0].lat && data[0].lon) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
    return fallback;
  } catch (e) {
    return fallback;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(200).send('OK'); return; }

  try {
    const params = req.body;
    const from = params.From || '';
    const body = params.Body || '';
    const numMedia = parseInt(params.NumMedia || '0');

    const parts = [{
      type: 'text',
      text: 'You are a commercial real estate data extractor for a Pune/Hyderabad CRE company. A broker sent this WhatsApp message with a property listing. Extract all available property information. IMPORTANT: Lease rate = monthly rent per sq ft (Rs 50-300 range). Sale rate = total price per sq ft (Rs 5000+ range). Return ONLY raw JSON, no markdown, no backticks. Use this exact structure: {"name":"","market":"","city":"Pune","status":"Available","furnish":"","floor":"","area":"","carpet":"","rate":"","salerate":"","cam":"","deposit":"","lockin":"","tenure":"","escal":"","owner":"","phone":""}\n\nMessage text:\n' + body
    }];

    const twilioAuth = 'Basic ' + Buffer.from(process.env.TWILIO_SID + ':' + process.env.TWILIO_AUTH).toString('base64');

    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = params['MediaUrl' + i];
      const mediaType = params['MediaContentType' + i];
      if (!mediaUrl) continue;
      const mediaResp = await fetch(mediaUrl, { headers: { Authorization: twilioAuth } });
      const buffer = await mediaResp.arrayBuffer();
      const b64 = Buffer.from(buffer).toString('base64');
      if (mediaType.indexOf('image') >= 0) {
        parts.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } });
      } else if (mediaType.indexOf('pdf') >= 0) {
        parts.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } });
      }
    }

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 800, messages: [{ role: 'user', content: parts }] })
    });
    const result = await aiRes.json();

    if (result.error) {
      await sendWhatsAppReply(from, 'Sorry, could not process that listing: ' + result.error.message, twilioAuth);
      res.status(200).send('OK');
      return;
    }

    let text = '';
    result.content.forEach(c => { text += c.text || ''; });
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(text);
    } catch (e) {
      await sendWhatsAppReply(from, 'Could not understand that listing format. Please try again.', twilioAuth);
      res.status(200).send('OK');
      return;
    }

    const code = 'WA' + Date.now().toString().slice(-8);
    const coords = await geocodeMarket(extracted.market, extracted.city || 'Pune');
    const insertBody = {
      code: code,
      name: extracted.name || 'Unnamed Property',
      market: extracted.market || '',
      city: extracted.city || 'Pune',
      status: extracted.status || 'Available',
      furnish: extracted.furnish || '',
      area: extracted.area || '',
      rate: extracted.rate || '',
      cam: extracted.cam || '',
      deposit: extracted.deposit || '',
      lockin: extracted.lockin || '',
      tenure: extracted.tenure || '',
      escal: extracted.escal || '',
      owner: extracted.owner || '',
      phone: extracted.phone || from.replace('whatsapp:', ''),
      notes: 'Received via WhatsApp bot. Sale rate: ' + (extracted.salerate || 'N/A'),
      lat: coords.lat,
      lng: coords.lng
    };

    // This runs server-side only (never shipped to a browser), so unlike
    // the dashboard's client-side calls it's a legitimate place to use
    // the service_role key, which bypasses Row Level Security - required
    // once RLS is on, since an inbound WhatsApp message has no logged-in
    // team member's session to satisfy the "editor/admin can insert"
    // policy with. Falls back to SUPABASE_KEY so this doesn't hard-fail
    // before that env var is added, though inserts will start being
    // rejected by RLS at that point same as any other unauthenticated
    // caller.
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
    const supaHeaders = {
      apikey: supaKey,
      Authorization: 'Bearer ' + supaKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    };
    let insertRes = await fetch(process.env.SUPABASE_URL + '/rest/v1/properties', {
      method: 'POST',
      headers: supaHeaders,
      body: JSON.stringify(Object.assign({ created_by: 'WhatsApp Bot' }, insertBody))
    });
    if (!insertRes.ok) {
      const errText = await insertRes.text();
      if (errText.indexOf('created_by') >= 0) {
        insertRes = await fetch(process.env.SUPABASE_URL + '/rest/v1/properties', {
          method: 'POST',
          headers: supaHeaders,
          body: JSON.stringify(insertBody)
        });
      }
    }

    if (insertRes.ok) {
      await sendWhatsAppReply(from, 'Property added: ' + insertBody.name + ' (' + insertBody.market + ')\nRate: Rs ' + (insertBody.rate || 'N/A') + ' PSF\nCode: ' + code + '\n\nIt is now live on the dashboard.', twilioAuth);
    } else {
      await sendWhatsAppReply(from, 'Extracted the listing but saving failed. Please check with your admin.', twilioAuth);
    }

    res.status(200).send('OK');
  } catch (err) {
    res.status(200).send('OK');
  }
};

async function sendWhatsAppReply(to, message, twilioAuth) {
  try {
    const body = new URLSearchParams({
      From: process.env.TWILIO_WHATSAPP_FROM,
      To: to,
      Body: message
    });
    await fetch('https://api.twilio.com/2010-04-01/Accounts/' + process.env.TWILIO_SID + '/Messages.json', {
      method: 'POST',
      headers: { Authorization: twilioAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
  } catch (e) {}
}
