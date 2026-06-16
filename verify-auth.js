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

    // H. Test OAuth Discovery Endpoint
    console.log('Testing OAuth Discovery Endpoint...');
    const discoveryRes = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
    assert.strictEqual(discoveryRes.status, 200);
    const discoveryJson = await discoveryRes.json();
    assert.strictEqual(discoveryJson.authorization_endpoint, `${baseUrl}/oauth/authorize`);
    assert.strictEqual(discoveryJson.token_endpoint, `${baseUrl}/oauth/token`);
    console.log('✅ OAuth Discovery Endpoint metadata matches successfully!');

    // I. Test OAuth Token Exchange flow
    console.log('Testing OAuth Token Exchange flow...');
    // Simulate user POST to /oauth/authorize (submitting passcode)
    const authorizeRes = await fetch(`${baseUrl}/oauth/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        redirect_uri: 'https://oauth.pstmn.io/v1/browser-callback',
        state: 'xyzState',
        client_id: 'admin',
        passcode: 'my-super-secret-mcp-key'
      }).toString(),
      redirect: 'manual' // Don't automatically follow redirect, we want to extract the code
    });

    assert.strictEqual(authorizeRes.status, 302, 'Should redirect back to client callback');
    const redirectLocation = authorizeRes.headers.get('location');
    const redirectUrl = new URL(redirectLocation);
    const authCode = redirectUrl.searchParams.get('code');
    assert.ok(authCode, 'Authorization code should exist in redirect URL');
    assert.strictEqual(redirectUrl.searchParams.get('state'), 'xyzState');
    console.log('✅ Correctly obtained authorization code:', authCode);

    // Exchange the code for access token at /oauth/token
    const tokenRes = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        client_id: 'admin',
        client_secret: 'my-super-secret-mcp-key'
      }).toString()
    });

    assert.strictEqual(tokenRes.status, 200, 'Token exchange should succeed');
    const tokenJson = await tokenRes.json();
    assert.strictEqual(tokenJson.token_type, 'Bearer');
    assert.strictEqual(tokenJson.access_token, 'my-super-secret-mcp-key');
    console.log('✅ Successfully exchanged code for Bearer access token!');

    // Connect to /sse using the returned bearer token
    console.log('Requesting SSE connection with the obtained OAuth access token...');
    const oauthSseController = new AbortController();
    const oauthSseRes = await fetch(`${baseUrl}/sse`, {
      headers: { 'Authorization': `Bearer ${tokenJson.access_token}` },
      signal: oauthSseController.signal
    });
    assert.strictEqual(oauthSseRes.status, 200, 'Should connect using Bearer token');
    oauthSseController.abort();
    console.log('✅ Correctly allowed connection using the OAuth access token!');

    console.log('--- All Authentication Middleware Verification Passed! ---');
  } catch (err) {
    console.error('❌ Verification failed:', err);
  } finally {
    serverProcess.kill('SIGINT');
  }
}

runTest();
