FROM node:20-slim AS node_base
FROM oven/bun:1.1
WORKDIR /app

# Récupérer un binaire Node.js récent (Node 20) pour supporter la syntaxe moderne (??)
COPY --from=node_base /usr/local/bin/node /usr/local/bin/node
COPY package.json ./
RUN bun install

# Source
COPY . .

EXPOSE 3001
CMD ["bun", "run", "start"]
