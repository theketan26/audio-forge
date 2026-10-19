import assert from 'node:assert';
import { createApp } from '../src/server.js';

console.log('Running API Gateway test suite...');

async function runTests() {
  const app = createApp();
  const apiKey = process.env.API_KEY || 'forge-secret-key';

  // Test 1: Public Health Check
  console.log('1. Testing GET /health (unauthenticated)...');
  const healthRes = await app.request('/health');
  assert.strictEqual(healthRes.status, 200, 'Health endpoint should return 200');
  const healthData = await healthRes.json();
  assert.strictEqual(healthData.status, 'ok', 'Health response should have status ok');
  console.log('✔ GET /health passed.');

  // Test 2: Unauthorized without API key
  console.log('2. Testing auth rejection on /api/v1/generate without header...');
  const unauthRes = await app.request('/api/v1/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hello' }),
  });
  assert.strictEqual(unauthRes.status, 401, 'Should reject requests without API key');
  console.log('✔ Auth rejection without API key verified.');

  // Test 3: Unauthorized with wrong API key
  console.log('3. Testing auth rejection with invalid API key...');
  const wrongKeyRes = await app.request('/api/v1/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'incorrect-key-1234',
    },
    body: JSON.stringify({ text: 'Hello' }),
  });
  assert.strictEqual(wrongKeyRes.status, 401, 'Should reject invalid API key');
  console.log('✔ Auth rejection with invalid API key verified.');

  // Test 4: Paginated List API with valid auth
  console.log('4. Testing GET /api/v1/generations with pagination...');
  const listRes = await app.request('/api/v1/generations?page=1&limit=5', {
    headers: { 'x-api-key': apiKey },
  });
  assert.strictEqual(listRes.status, 200, 'List endpoint should return 200');
  const listData = await listRes.json();
  assert(typeof listData.total === 'number', 'Response must include total count');
  assert(Array.isArray(listData.items), 'Response must include items array');
  assert.strictEqual(listData.page, 1, 'Page should be 1');
  assert.strictEqual(listData.limit, 5, 'Limit should be 5');
  console.log(`✔ GET /api/v1/generations passed (Found ${listData.total} total records).`);

  // Test 5: Fetch Status of existing record
  if (listData.items.length > 0) {
    const existingId = listData.items[0].id;
    console.log(`5. Testing GET /api/v1/generations/${existingId}...`);
    const statusRes = await app.request(`/api/v1/generations/${existingId}`, {
      headers: { 'x-api-key': apiKey },
    });
    assert.strictEqual(statusRes.status, 200, 'Status endpoint should return 200');
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.id, existingId, 'ID must match');
    assert(['processing', 'success', 'failed'].includes(statusData.status), 'Status must be valid');
    console.log(`✔ GET /api/v1/generations/:id verified (Status: ${statusData.status}).`);
  }

  // Test 6: POST /api/v1/generate returns immediate ACK
  console.log('6. Testing POST /api/v1/generate (Immediate ACK)...');
  const genRes = await app.request('/api/v1/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      text: 'Testing asynchronous audio generation API gateway.',
      voice: 'en_US-lessac-low',
    }),
  });
  assert.strictEqual(genRes.status, 202, 'Generate endpoint should return 202 Accepted');
  const genData = await genRes.json();
  assert.strictEqual(genData.status, 'processing', 'Initial status must be processing');
  assert(genData.id, 'Must return job ID');
  assert(genData.status_url, 'Must return status check URL');
  console.log(`✔ POST /api/v1/generate returned 202 ACK with Job ID: ${genData.id}`);

  console.log('\nAll API Gateway tests passed! 🎉');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
