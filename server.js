const http = require('http');
const crypto = require('crypto');

const port = Number(process.env.PORT || 4242);
const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;
const mrsacApiBase = (process.env.MRSAC_API_BASE || 'https://yrwxrlqqli3zo7xvpihbhywp7e0alpse.lambda-url.ap-south-1.on.aws').replace(/\/$/, '');

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': process.env.APP_ORIGIN || 'http://localhost:3000', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100_000) reject(new Error('Request too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && req.url.startsWith('/api/mrsac/')) {
    try {
      const path = req.url.slice('/api/mrsac'.length);
      const upstream = await fetch(`${mrsacApiBase}/api${path}`, { headers: { Accept: 'application/json, application/geo+json' } });
      const body = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' });
      return res.end(body);
    } catch (error) { return send(res, 502, { error: error.message || 'MRSAC API request failed.' }); }
  }
  if (req.method !== 'POST') return send(res, 404, { error: 'Not found' });
  if (req.url === '/api/payments/create-order') {
    if (!keyId || !keySecret) return send(res, 503, { error: 'Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable checkout.' });
    try {
      const input = await readBody(req);
      const amount = Number(process.env.RAZORPAY_AMOUNT_PAISE || 9900);
      if (!Number.isInteger(amount) || amount < 100 || amount > 100_000_000) return send(res, 500, { error: 'Server payment amount is invalid.' });
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, currency: input.currency === 'INR' ? 'INR' : 'INR', receipt: String(input.receipt || `parcel-${Date.now()}`).slice(0, 40), notes: { product: 'BhuMitra Explorer' } }),
      });
      const order = await response.json();
      if (!response.ok) return send(res, response.status, { error: order.error?.description || 'Razorpay could not create an order.' });
      return send(res, 200, { id: order.id, amount: order.amount, currency: order.currency, keyId });
    } catch (error) { return send(res, 502, { error: error.message || 'Could not create payment order.' }); }
  }
  if (req.url === '/api/payments/verify') {
    if (!keySecret) return send(res, 503, { error: 'Payment verification is not configured.' });
    try {
      const input = await readBody(req);
      if (![input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature].every(value => typeof value === 'string' && value.length)) return send(res, 400, { error: 'Payment verification fields are missing.' });
      const expected = crypto.createHmac('sha256', keySecret).update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`).digest();
      const received = Buffer.from(input.razorpay_signature, 'hex');
      if (received.length !== expected.length || !crypto.timingSafeEqual(expected, received)) return send(res, 400, { verified: false, error: 'Payment signature did not match.' });
      return send(res, 200, { verified: true });
    } catch (error) { return send(res, 400, { error: error.message || 'Could not verify payment.' }); }
  }
  return send(res, 404, { error: 'Not found' });
});

server.listen(port, () => console.log(`BhuMitra payment API listening on http://localhost:${port}`));
