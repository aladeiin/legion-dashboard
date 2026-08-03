module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ success: false, error: 'Method not allowed' }); return; }

  try {
    const { prompt, files, max_tokens } = req.body;
    const parts = [{ type: 'text', text: prompt }];

    if (files && files.length) {
      files.forEach(f => {
        if (f.type && f.type.indexOf('image') >= 0) {
          parts.push({ type: 'image', source: { type: 'base64', media_type: f.type, data: f.data } });
        } else if (f.type && f.type.indexOf('pdf') >= 0) {
          parts.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } });
        } else if (f.text) {
          parts.push({ type: 'text', text: f.text });
        }
      });
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
        max_tokens: max_tokens || 800,
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
