// Test Groq API connectivity
const url = 'https://api.groq.com/openai/v1/models';
const apiKey = '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';

console.log('Testing Groq API:', url);
console.time('fetch');

fetch(url, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
  },
  signal: AbortSignal.timeout(10000)
})
  .then(response => {
    console.timeEnd('fetch');
    console.log('Status:', response.status);
    return response.text();
  })
  .then(text => {
    console.log('Response preview:', text.slice(0, 300));
  })
  .catch(error => {
    console.timeEnd('fetch');
    console.error('Fetch error:', error.name, error.message);
  });
