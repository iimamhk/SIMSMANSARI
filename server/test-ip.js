// Test connection to IP directly
import axios from 'axios';

const url = 'https://175.12.98.233/v1/models';
const apiKey = 'sk-VZXbd9Bn1nwCgVZUweMq1l1O0JBT1TrcpMYQFXMtZPOGtegI';

console.log('Testing connection to IP directly');
console.time('axios');

axios.get(url, {
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Host': 'api.iamhc.cn',  // SNI header
  },
  timeout: 10000,
  httpsAgent: new (await import('https')).default.Agent({
    rejectUnauthorized: false
  })
})
  .then(response => {
    console.timeEnd('axios');
    console.log('Status:', response.status);
  })
  .catch(error => {
    console.timeEnd('axios');
    console.error('Error:', error.message);
  });
