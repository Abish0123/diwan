const http = require('http');

const data = JSON.stringify({
  email: 'admin@example.com',
  password: 'password123'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    console.log('[v0] Status:', res.statusCode);
    console.log('[v0] Headers:', res.headers);
    console.log('[v0] Response:', body.slice(0, 200));
  });
});

req.on('error', (e) => {
  console.error('[v0] Error:', e.message);
});

req.write(data);
req.end();
