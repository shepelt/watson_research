FROM node:18-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache curl jq

# Copy package files
COPY package.json package-lock.json* ./

# Install npm dependencies
RUN npm install

# Copy orchestrator scripts
COPY scripts/ ./scripts/

# Make scripts executable
RUN chmod +x scripts/*.js || true

# Entry point (overridden by docker-compose)
CMD ["node", "--version"]
