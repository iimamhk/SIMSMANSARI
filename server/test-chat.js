// Test chat completions endpoint
const url = 'https://api.iamhc.cn/v1/chat/completions';
const apiKey = 'sk-VZXbd9Bn1nwCgVZUweMq1l1O0JBT1TrcpMYQFXMtZPOGtegI';

const body = JSON.stringify({
  model: 'glm-5.2',
  messages: [{ role: 'user', content: 'ping' }],
  temperature: 0.7,
  max_tokens: 10
});

console.log('Testing chat completions:', url);
console.log('Body:', body);
console.time('fetch');

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  signal: AbortSignal.timeout(30000) // 30 second timeout
})
  .then(response => {
    console.timeEnd('fetch');
    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    return response.text();
  })
  .then(text => {
    console.log('Response length:', text.length);
    console.log('First 500 chars:', text.slice(0, 500));
  })
  .catch(error => {
    console.timeEnd('fetch');
    console.error('Fetch error:', error.name, error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  });
