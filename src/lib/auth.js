import process from 'node:process';

/**
 * Middleware to authenticate requests using a configured AUTH_TOKEN.
 * Validates tokens from query params (?auth_token=), X-Auth-Token header,
 * or standard Bearer authorization header.
 */
export function authenticateToken(req, res, next) {
  const serverAuthToken = process.env.AUTH_TOKEN;
  const serverClientId = process.env.CLIENT_ID || 'admin';

  // Enforce that AUTH_TOKEN must be configured in the environment
  if (!serverAuthToken) {
    console.error('[Auth] Server configuration error: AUTH_TOKEN is not defined in the environment.');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Server security configuration error. Access denied.'
    });
  }

  // 1. Check Query Parameters / Headers for token and client ID
  let clientToken = req.query.auth_token;
  let clientId = req.query.client_id || req.headers['x-client-id'];

  // 2. Check X-Auth-Token Header
  if (!clientToken && req.headers['x-auth-token']) {
    clientToken = req.headers['x-auth-token'];
  }

  // 3. Check Authorization Header (Bearer or Basic)
  if (!clientToken && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2) {
      const authType = parts[0].toLowerCase();
      if (authType === 'bearer') {
        clientToken = parts[1];
      } else if (authType === 'basic') {
        try {
          const credentials = Buffer.from(parts[1], 'base64').toString('utf-8');
          const colonIndex = credentials.indexOf(':');
          if (colonIndex !== -1) {
            clientId = credentials.substring(0, colonIndex);
            clientToken = credentials.substring(colonIndex + 1);
          }
        } catch (e) {
          // Ignore decoding errors
        }
      }
    }
  }

  // Verify Client ID if provided
  if (clientId && clientId !== serverClientId) {
    console.warn(`[Auth] Unauthorized client ID attempt: ${clientId}`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid Client ID. Access denied.'
    });
  }

  // Verification of the token
  if (!clientToken || clientToken !== serverAuthToken) {
    console.warn(`[Auth] Unauthorized request attempt from IP ${req.headers['x-forwarded-for'] || req.ip} (Token provided: ${clientToken ? 'yes (invalid)' : 'no'})`);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token. Access denied.'
    });
  }

  // Token is valid
  next();
}
