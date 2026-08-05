// Only the deployed dashboard (and localhost during development) may call
// this endpoint - it spends Anthropic API budget on every request, and
// without this check the URL would be an open, unmetered proxy to Claude
// for anyone who found it.
const ALLOWED_ORIGIN = 'https://legion-dashboard.vercel.app';
function isAllowedOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  return origin.indexOf(ALLOWED_ORIGIN) === 0 ||
    origin.indexOf('http://localhost') === 0 ||
    origin.indexOf('http://127.0.0.1') === 0;
}

module.exports = async function handler(req, res) {
  const allowed = isAllowedOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', allowed ? (req.headers.origin || ALLOWED_ORIGIN) : ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ success: false, error: 'Method not allowed' }); return; }
  if (!allowed) { res.status(403).json({ success: false, error: 'Forbidden' }); return; }

  try {
    const { prompt, files, max_tokens } = req.body;
    const cappedMaxTokens = Math.min(max_tokens || 800, 4000);
    const parts = [{ type: 'text', text: prompt }];

    if (files && files.length) {
      for (const f of files) {
        let data = f.data;
        if (!data && f.url) {
          const fileRes = await fetch(f.url);
          if (!fileRes.ok) throw new Error('Failed to fetch uploaded file for extraction');
          const buf = await fileRes.arrayBuffer();
          data = Buffer.from(buf).toString('base64');
        }
        if (f.type && f.type.indexOf('image') >= 0) {
          parts.push({ type: 'image', source: { type: 'base64', media_type: f.type, data } });
        } else if (f.type && f.type.indexOf('pdf') >= 0) {
          parts.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
        } else if (f.text) {
          parts.push({ type: 'text', text: f.text });
        }
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: cappedMaxTokens,
        messages: [{ role: 'user', content: parts }]
      })
    });

    const result = await response.json();
    if (result.error) { res.status(200).json({ success: false, error: result.error.message }); return; }

    let text = '';
    result.content.forEach(c => { text += c.text || ''; });
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const extracted = JSON.parse(text);
    res.status(200).json({ success: true, extracted });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
};
