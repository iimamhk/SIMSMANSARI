// Test with undici
import { fetch } from 'undici';

const url = 'https://api.iamhc.cn/v1/chat/completions';
const apiKey = 'sk-VZXbd9Bn1nwCgVZUweMq1l1O0JBT1TrcpMYQFXMtZPOGtegI';

const body = {
  model: 'glm-5.2',
  messages: [{ role: 'user', content: 'hi' }],
};

console.log('Testing with undici fetch');
console.time('fetch');

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify(body),
})
  .then(response => {
    console.timeEnd('fetch');
    console.log('Status:', response.status);
    return response.text();
  })
  .then(text => {
    console.log('Response:', text.slice(0, 500));
  })
  .catch(error => {
    console.timeEnd('fetch');
    console.error('Error:', error.message);
    console.error('Cause:', error.cause);
  });
