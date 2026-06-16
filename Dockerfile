FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies (only production)
RUN npm ci --production

# Copy application source code
COPY src ./src

# Expose server port (default 3000, customizable via PORT env)
EXPOSE 3000

# Start MCP server
CMD ["node", "src/index.js"]
