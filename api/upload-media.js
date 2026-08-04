module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ success: false, error: 'Method not allowed' }); return; }

  try {
    const { propertyCode, propertyName, fileName, mimeType, fileData } = req.body;

    const safeFolder = (propertyCode + '_' + propertyName).replace(/[^a-zA-Z0-9_-]/g, '_');
    const path = safeFolder + '/' + Date.now() + '_' + fileName;

    const buffer = Buffer.from(fileData, 'base64');

    const uploadRes = await fetch(
      process.env.SUPABASE_URL + '/storage/v1/object/property-media/' + encodeURIComponent(path),
      {
        method: 'POST',
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: 'Bearer ' + process.env.SUPABASE_KEY,
          'Content-Type': mimeType
        },
        body: buffer
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      res.status(200).json({ success: false, error: 'Upload failed: ' + errText });
      return;
    }

    const publicUrl = process.env.SUPABASE_URL + '/storage/v1/object/public/property-media/' + encodeURIComponent(path);

    res.status(200).json({
      success: true,
      fileUrl: publicUrl,
      thumbUrl: publicUrl
    });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
};
