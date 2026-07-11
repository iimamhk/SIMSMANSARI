// Quick test to see if Node.js fetch can reach IAMHC API
const url = 'https://api.iamhc.cn/v1/models';
const apiKey = 'sk-VZXbd9Bn1nwCgVZUweMq1l1O0JBT1TrcpMYQFXMtZPOGtegI';

console.log('Testing fetch to:', url);
console.time('fetch');

fetch(url, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
  },
  signal: AbortSignal.timeout(10000) // 10 second timeout
})
  .then(response => {
    console.timeEnd('fetch');
    console.log('Status:', response.status);
    return response.text();
  })
  .then(text => {
    console.log('Response:', text.slice(0, 200));
  })
  .catch(error => {
    console.timeEnd('fetch');
    console.error('Fetch error:', error.name, error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  });
