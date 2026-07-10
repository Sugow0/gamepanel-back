FROM oven/bun:1.1-alpine
WORKDIR /app

# Dépendances
COPY package.json ./
RUN bun install

# Source
COPY . .

EXPOSE 3001
CMD ["bun", "run", "start"]
