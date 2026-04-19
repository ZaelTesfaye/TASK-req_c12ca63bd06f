FROM node:20-alpine

WORKDIR /app

# curl is used by the healthcheck defined in docker-compose.yml
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci

COPY src ./src

EXPOSE 3000

# Compose's `depends_on.postgres.condition: service_healthy` already
# blocks this container from starting until postgres is reachable, so
# we don't need an in-container wait-for-postgres shim. The previous
# heredoc-authored `wait-for-postgres.sh` also silently broke under
# Windows line endings (`\r\n`) — `sh` parsed `set -e\r` as a bad
# flag and the entrypoint exited before printing anything, producing
# the "container Started but zero logs" failure mode in CI.
CMD ["node", "src/server.js"]
