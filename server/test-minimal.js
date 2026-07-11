// Minimal test case
const url = 'https://api.iamhc.cn/v1/chat/completions';
const apiKey = 'sk-VZXbd9Bn1nwCgVZUweMq1l1O0JBT1TrcpMYQFXMtZPOGtegI';

// Try different model
const body = {
  model: 'DeepSeek-V4-Flash',
  messages: [{ role: 'user', content: 'hi' }]
};

console.log('Testing with DeepSeek-V4-Flash');
console.log('Body:', JSON.stringify(body, null, 2));

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(30000)
})
  .then(response => {
    console.log('Status:', response.status);
    return response.text();
  })
  .then(text => {
    console.log('Response:', text.slice(0, 1000));
  })
  .catch(error => {
    console.error('Error:', error.message);
  });
