# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production and build dependencies
RUN npm ci

# Copy source code
COPY . .

# Stage 2: Final Production Image
FROM node:20-alpine

WORKDIR /app

# Ensure required storage directories exist with correct permissions for 'node' user
RUN mkdir -p logs uploads && chown -R node:node /app

# Copy dependency manifests and source from builder with correct ownership
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app ./

# Switch to non-privileged user
USER node

# Expose the application port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["npm", "run", "start"]
