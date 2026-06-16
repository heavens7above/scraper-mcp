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

    // D. Request /sse with valid token but WRONG client ID (Should fail)
    console.log('Requesting SSE connection with valid token but WRONG client ID...');
    const wrongClientRes = await fetch(`${baseUrl}/sse?auth_token=my-super-secret-mcp-key&client_id=hacky-client`);
    console.log('Status code (wrong client id):', wrongClientRes.status);
    assert.strictEqual(wrongClientRes.status, 401, 'Should fail with 401 Unauthorized');
    console.log('✅ Correctly blocked request with wrong client ID!');

    // E. Request /sse with valid token and VALID client ID 'admin' (Should succeed)
    console.log('Requesting SSE connection with valid token and VALID client ID...');
    const successClientController = new AbortController();
    const successClientRes = await fetch(`${baseUrl}/sse?auth_token=my-super-secret-mcp-key&client_id=admin`, {
      signal: successClientController.signal
    });
    console.log('Status code (valid client id):', successClientRes.status);
    assert.strictEqual(successClientRes.status, 200, 'Should connect with 200 OK');
    successClientController.abort();
    console.log('✅ Correctly allowed request with valid token & client ID!');

    // F. Request /sse with Basic Auth using 'admin:my-super-secret-mcp-key' (Should succeed)
    console.log('Requesting SSE connection with Basic Auth (admin:my-super-secret-mcp-key)...');
    const basicController = new AbortController();
    const basicAuthHeader = 'Basic ' + Buffer.from('admin:my-super-secret-mcp-key').toString('base64');
    const basicRes = await fetch(`${baseUrl}/sse`, {
      headers: { 'Authorization': basicAuthHeader },
      signal: basicController.signal
    });
    console.log('Status code (Basic Auth):', basicRes.status);
    assert.strictEqual(basicRes.status, 200, 'Should connect with 200 OK');
    basicController.abort();
    console.log('✅ Correctly allowed Basic Auth connection!');

    // G. Request /sse with Basic Auth using wrong password (Should fail)
    console.log('Requesting SSE connection with Basic Auth using wrong password...');
    const wrongBasicAuthHeader = 'Basic ' + Buffer.from('admin:wrong-pass').toString('base64');
    const wrongBasicRes = await fetch(`${baseUrl}/sse`, {
      headers: { 'Authorization': wrongBasicAuthHeader }
    });
    console.log('Status code (Wrong Basic Auth):', wrongBasicRes.status);
    assert.strictEqual(wrongBasicRes.status, 401, 'Should fail with 401');
    console.log('✅ Correctly blocked wrong Basic Auth password!');

    console.log('--- All Authentication Middleware Verification Passed! ---');
  } catch (err) {
    console.error('❌ Verification failed:', err);
  } finally {
    serverProcess.kill('SIGINT');
  }
}

runTest();
