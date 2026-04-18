FROM node:20-alpine

WORKDIR /app

# Install curl for healthchecks if needed
RUN apk add --no-cache curl

# Copy dependency manifests and install
COPY package*.json ./
RUN npm ci

# Copy application source
COPY src ./src

# Wait for postgres to be ready before starting
# This is a safety net in addition to docker-compose depends_on healthcheck
COPY <<'SCRIPT' /usr/local/bin/wait-for-postgres.sh
#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."

# Extract host and port from DATABASE_URL
# Expected format: postgresql://user:pass@host:port/dbname
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:]+):([0-9]+)/.*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:]+):([0-9]+)/.*|\2|')

MAX_RETRIES=30
RETRY=0

while [ "$RETRY" -lt "$MAX_RETRIES" ]; do
  if nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; then
    echo "PostgreSQL is ready on ${DB_HOST}:${DB_PORT}"
    exec "$@"
  fi
  RETRY=$((RETRY + 1))
  echo "Waiting for PostgreSQL... attempt ${RETRY}/${MAX_RETRIES}"
  sleep 1
done

echo "ERROR: PostgreSQL did not become ready in time"
exit 1
SCRIPT

RUN chmod +x /usr/local/bin/wait-for-postgres.sh

EXPOSE 3000

CMD ["sh", "/usr/local/bin/wait-for-postgres.sh", "node", "src/server.js"]
