import process from 'node:process';
import express from 'express';

// In-memory store for authorization codes (temporary, expires in 5 mins)
const authCodes = new Map();

/**
 * Configure OAuth endpoints on the Express application.
 */
export function setupOAuth(app) {
  const serverClientId = process.env.CLIENT_ID || 'admin';
  const serverAuthToken = process.env.AUTH_TOKEN;

  // 1. Discovery Endpoint
  app.get('/.well-known/oauth-authorization-server', (req, res) => {
    const host = req.get('host');
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post']
    });
  });

  // 2. Authorization Endpoint (Serves the premium login UI)
  app.get('/oauth/authorize', (req, res) => {
    const { redirect_uri, state, client_id, response_type } = req.query;

    if (!redirect_uri) {
      return res.status(400).send('Missing redirect_uri parameter.');
    }

    // Serve a stunning, modern dark-mode login page
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Authorize ScraperMCP Connection</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
        <style>
          :root {
            --bg-color: #0d0f12;
            --card-bg: #161a22;
            --accent-glow: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
            --border-color: #374151;
          }
          body {
            margin: 0;
            padding: 0;
            background-color: var(--bg-color);
            color: var(--text-main);
            font-family: 'Outfit', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            overflow: hidden;
          }
          .background-glow {
            position: absolute;
            width: 600px;
            height: 600px;
            background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.05) 50%, transparent 100%);
            z-index: 1;
            pointer-events: none;
          }
          .card {
            background-color: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 24px;
            padding: 40px;
            width: 100%;
            max-width: 400px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
            z-index: 2;
            position: relative;
            backdrop-filter: blur(10px);
          }
          .logo {
            background: var(--accent-glow);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-size: 32px;
            font-weight: 800;
            text-align: center;
            margin-bottom: 8px;
            letter-spacing: -1px;
          }
          .subtitle {
            color: var(--text-muted);
            font-size: 14px;
            text-align: center;
            margin-bottom: 32px;
          }
          .input-group {
            margin-bottom: 24px;
          }
          label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
            margin-bottom: 8px;
          }
          input {
            width: 100%;
            padding: 14px 16px;
            border-radius: 12px;
            background-color: #0b0d10;
            border: 1px solid var(--border-color);
            color: var(--text-main);
            font-family: inherit;
            font-size: 16px;
            box-sizing: border-box;
            transition: all 0.3s ease;
          }
          input:focus {
            outline: none;
            border-color: #818cf8;
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
          }
          .btn {
            width: 100%;
            padding: 14px;
            border-radius: 12px;
            background: var(--accent-glow);
            border: none;
            color: #ffffff;
            font-family: inherit;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s ease, opacity 0.2s ease;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
          }
          .btn:hover {
            opacity: 0.95;
            transform: translateY(-1px);
          }
          .btn:active {
            transform: translateY(1px);
          }
          .error-msg {
            color: #ef4444;
            background-color: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            padding: 12px;
            border-radius: 12px;
            font-size: 14px;
            margin-bottom: 20px;
            display: none;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="background-glow"></div>
        <div class="card">
          <div class="logo">ScraperMCP</div>
          <div class="subtitle">Secure Connection Authorization</div>
          
          <div id="errorBox" class="error-msg"></div>

          <form action="/oauth/authorize" method="POST">
            <input type="hidden" name="redirect_uri" value="${encodeURIComponent(redirect_uri)}">
            <input type="hidden" name="state" value="${state || ''}">
            <input type="hidden" name="client_id" value="${client_id || ''}">
            
            <div class="input-group">
              <label for="passcode">Authentication Passcode</label>
              <input type="password" id="passcode" name="passcode" required placeholder="Enter AUTH_TOKEN">
            </div>

            <button type="submit" class="btn">Authorize Claude</button>
          </form>
        </div>

        <script>
          // Parse query params to display errors if redirected back
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('error') === '1') {
            const errorBox = document.getElementById('errorBox');
            errorBox.innerText = 'Invalid passcode or mismatching Client ID.';
            errorBox.style.display = 'block';
          }
        </script>
      </body>
      </html>
    `);
  });

  // 3. Authorization Form Submission
  app.post('/oauth/authorize', express.urlencoded({ extended: true }), (req, res) => {
    const { redirect_uri, state, client_id, passcode } = req.body;
    const decodedRedirectUri = decodeURIComponent(redirect_uri);

    if (passcode !== serverAuthToken || (client_id && client_id !== serverClientId)) {
      // Redirect back with error query param
      const errUrl = `/oauth/authorize?redirect_uri=${redirect_uri}&state=${state || ''}&client_id=${client_id || ''}&error=1`;
      return res.redirect(errUrl);
    }

    // Generate a temporary authorization code
    const authCode = 'ac_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // Store it with an expiration of 5 minutes
    authCodes.set(authCode, {
      clientId: client_id || serverClientId,
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    // Clean up expired code after 5 minutes
    setTimeout(() => {
      authCodes.delete(authCode);
    }, 5 * 60 * 1000);

    // Redirect user back to Claude's callback URL
    const callbackUrl = new URL(decodedRedirectUri);
    callbackUrl.searchParams.set('code', authCode);
    if (state) {
      callbackUrl.searchParams.set('state', state);
    }

    res.redirect(callbackUrl.toString());
  });

  // 4. Token Endpoint
  app.post('/oauth/token', express.urlencoded({ extended: true }), (req, res) => {
    let client_id = req.body.client_id;
    let client_secret = req.body.client_secret;
    const { grant_type, code } = req.body;

    // Check if client_id and client_secret are provided in Basic Auth header
    if (req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'basic') {
        try {
          const credentials = Buffer.from(parts[1], 'base64').toString('utf-8');
          const colonIndex = credentials.indexOf(':');
          if (colonIndex !== -1) {
            client_id = credentials.substring(0, colonIndex);
            client_secret = credentials.substring(colonIndex + 1);
          }
        } catch (e) {
          // Ignore decoding errors
        }
      }
    }

    // Verify Grant Type
    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }

    // Verify Authorization Code
    const savedCode = authCodes.get(code);
    if (!savedCode || savedCode.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'invalid_grant', message: 'Authorization code invalid or expired.' });
    }

    // Verify Client ID & Secret
    if (client_secret !== serverAuthToken || (client_id && client_id !== serverClientId)) {
      return res.status(401).json({ error: 'invalid_client', message: 'Client ID or Secret is incorrect.' });
    }

    // Clean up the used code
    authCodes.delete(code);

    // Return access token (reusing AUTH_TOKEN as the access token directly)
    res.json({
      access_token: serverAuthToken,
      token_type: 'Bearer',
      expires_in: 86400 // 24 hours
    });
  });
}
