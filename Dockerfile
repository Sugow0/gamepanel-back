FROM oven/bun:1.1
WORKDIR /app

# Dépendances système (Node.js requis pour le worker SFTP)
RUN apt-get update && apt-get install -y nodejs
COPY package.json ./
RUN bun install

# Source
COPY . .

EXPOSE 3001
CMD ["bun", "run", "start"]
