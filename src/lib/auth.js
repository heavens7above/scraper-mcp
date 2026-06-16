import process from 'node:process';

/**
 * Middleware to authenticate requests using a configured AUTH_TOKEN.
 * Validates tokens from query params (?auth_token=), X-Auth-Token header,
 * or standard Bearer authorization header.
 */
export function authenticateToken(req, res, next) {
  const serverAuthToken = process.env.AUTH_TOKEN;

  // Enforce that AUTH_TOKEN must be configured in the environment
  if (!serverAuthToken) {
    console.error('[Auth] Server configuration error: AUTH_TOKEN is not defined in the environment.');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Server security configuration error. Access denied.'
    });
  }

  // 1. Check Query Parameters
  let clientToken = req.query.auth_token;

  // 2. Check X-Auth-Token Header
  if (!clientToken && req.headers['x-auth-token']) {
    clientToken = req.headers['x-auth-token'];
  }

  // 3. Check Authorization Header (Bearer Token)
  if (!clientToken && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      clientToken = parts[1];
    }
  }

  // Verification
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
