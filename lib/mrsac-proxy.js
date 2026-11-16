const DEFAULT_MRSAC_API_BASE = 'https://yrwxrlqqli3zo7xvpihbhywp7e0alpse.lambda-url.ap-south-1.on.aws';

module.exports = async function proxyMRSAC(req, res, endpoint) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requestUrl = new URL(req.url, 'http://localhost');
  const apiBase = (process.env.MRSAC_API_BASE || DEFAULT_MRSAC_API_BASE).replace(/\/$/, '');
  try {
    const upstream = await fetch(`${apiBase}/api/${endpoint}${requestUrl.search}`, {
      headers: { Accept: 'application/json, application/geo+json' },
      signal: AbortSignal.timeout(15000),
    });
    const body = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(upstream.status).send(body);
  } catch (error) {
    return res.status(502).json({ error: error.name === 'TimeoutError' ? 'MRSAC API request timed out.' : 'MRSAC API request failed.' });
  }
};
