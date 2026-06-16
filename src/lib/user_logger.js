import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists relative to project root
const logsDir = path.resolve(__dirname, '../../logs');
const logFilePath = path.join(logsDir, 'user_footprints.jsonl');

try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (err) {
  console.error('[User Logger] Failed to create logs directory:', err.message);
}

/**
 * Log a user connection, disconnection, or footprint event to JSONL file.
 * 
 * @param {string} eventType "session_connect" | "session_disconnect" | "tool_call"
 * @param {object} details Information about the event (ip, userAgent, sessionId, toolName, args, etc.)
 */
export function logUserEvent(eventType, details = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event_type: eventType,
    session_id: details.sessionId || null,
    ip: details.ip || null,
    user_agent: details.userAgent || null,
    ...details
  };

  const logLine = JSON.stringify(logEntry) + '\n';

  try {
    fs.promises.appendFile(logFilePath, logLine, 'utf8')
      .catch((err) => console.error('[User Logger] Failed to write log line asynchronously:', err.message));

    // Also log key details to stdout for container/Railway log observability
    if (eventType === 'session_connect') {
      console.log(`[User Log] New connection: Session ${details.sessionId} from IP ${details.ip}`);
    } else if (eventType === 'tool_call') {
      console.log(`[User Log] Tool execution: Session ${details.sessionId} called ${details.toolName} - Args: ${JSON.stringify(details.arguments)}`);
    } else if (eventType === 'session_disconnect') {
      console.log(`[User Log] Disconnection: Session ${details.sessionId}`);
    }
  } catch (err) {
    console.error('[User Logger] Unexpected logger error:', err.message);
  }
}
