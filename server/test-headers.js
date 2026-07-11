// Test with proper headers
import axios from 'axios';

const url = 'https://api.iamhc.cn/v1/models';
const apiKey = 'sk-VZXbd9Bn1nwCgVZUweMq1l1O0JBT1TrcpMYQFXMtZPOGtegI';

console.log('Testing with proper headers and short timeout');
console.time('request');

axios.get(url, {
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'User-Agent': 'axios/1.6.0',
    'Accept': 'application/json',
  },
  timeout: 10000,
  maxRedirects: 5,
})
  .then(response => {
    console.timeEnd('request');
    console.log('SUCCESS! Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2).slice(0, 300));
  })
  .catch(error => {
    console.timeEnd('request');
    console.error('Error:', error.code || error.message);
    if (error.response) {
      console.log('Response status:', error.response.status);
    }
  });
