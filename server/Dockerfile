FROM node:20-slim

WORKDIR /app

# Copy manifests first for layer caching
COPY package*.json ./

# Skip optional deps (msnodesqlv8 is Windows-only; the app falls back to mssql/tedious)
RUN npm ci --omit=optional

# Copy the rest of the source
COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
