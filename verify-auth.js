import { spawn } from 'node:child_process';
import assert from 'node:assert';

const PORT = 3002;
const baseUrl = `http://localhost:${PORT}`;

console.log('--- Verifying Access Authorization Middleware ---');

// 1. Spawn server with AUTH_TOKEN set
const serverProcess = spawn('node', ['src/index.js'], {
  env: {
    ...process.env,
    PORT: PORT.toString(),
    AUTH_TOKEN: 'my-super-secret-mcp-key'
  }
});

serverProcess.stdout.on('data', (data) => {
  console.log(`[Server] ${data.toString().trim()}`);
});

serverProcess.stderr.on('data', (data) => {
  console.error(`[Server Stderr] ${data.toString().trim()}`);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTest() {
  await sleep(2500); // startup

  try {
    // A. Request /sse without token (Should fail with 401)
    console.log('Requesting SSE connection WITHOUT token...');
    const failedRes = await fetch(`${baseUrl}/sse`);
    console.log('Status code (no token):', failedRes.status);
    assert.strictEqual(failedRes.status, 401, 'Should fail with 401 Unauthorized');
    const failedJson = await failedRes.json();
    assert.strictEqual(failedJson.error, 'Unauthorized');
    console.log('✅ Correctly blocked request without auth token!');

    // B. Request /sse with invalid token (Should fail with 401)
    console.log('Requesting SSE connection with WRONG token...');
    const wrongRes = await fetch(`${baseUrl}/sse?auth_token=wrong-key`);
    console.log('Status code (wrong token):', wrongRes.status);
    assert.strictEqual(wrongRes.status, 401, 'Should fail with 401 Unauthorized');
    console.log('✅ Correctly blocked request with invalid token!');

    // C. Request /sse with valid token (Should succeed)
    console.log('Requesting SSE connection WITH valid token...');
    const successController = new AbortController();
    const successRes = await fetch(`${baseUrl}/sse?auth_token=my-super-secret-mcp-key`, {
      signal: successController.signal
    });
    console.log('Status code (valid token):', successRes.status);
    assert.strictEqual(successRes.status, 200, 'Should connect with 200 OK');
    successController.abort();
    console.log('✅ Correctly allowed request with valid token!');

    console.log('--- All Authentication Middleware Verification Passed! ---');
  } catch (err) {
    console.error('❌ Verification failed:', err);
  } finally {
    serverProcess.kill('SIGINT');
  }
}

runTest();
