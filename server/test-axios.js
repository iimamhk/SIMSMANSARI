// Test with axios
import axios from 'axios';

const url = 'https://api.iamhc.cn/v1/chat/completions';
const apiKey = 'sk-VZXbd9Bn1nwCgVZUweMq1l1O0JBT1TrcpMYQFXMtZPOGtegI';

const body = {
  model: 'glm-5.2',
  messages: [{ role: 'user', content: 'ping' }],
  max_tokens: 5,
};

console.log('Testing with axios');
console.time('axios');

axios.post(url, body, {
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  timeout: 30000,
})
  .then(response => {
    console.timeEnd('axios');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2).slice(0, 500));
  })
  .catch(error => {
    console.timeEnd('axios');
    console.error('Error:', error.message);
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response data:', error.response.data);
    }
  });
