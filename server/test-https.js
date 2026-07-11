// Test if Node.js HTTPS works at all
import axios from 'axios';

console.log('Testing Google...');
axios.get('https://www.google.com', { timeout: 5000 })
  .then(response => {
    console.log('Google OK - Status:', response.status);
    return axios.get('https://api.openai.com', { timeout: 5000 });
  })
  .then(response => {
    console.log('OpenAI API reachable - Status:', response.status);
  })
  .catch(error => {
    console.error('Error:', error.message);
  });
