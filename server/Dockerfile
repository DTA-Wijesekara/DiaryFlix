FROM node:22-slim

WORKDIR /app

# Copy manifests first for layer caching
COPY package*.json ./

# Install runtime packages; no native SQL Server driver is used.
RUN npm ci --omit=optional

# Copy the rest of the source
COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
