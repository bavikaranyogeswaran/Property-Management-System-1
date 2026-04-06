# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production and build dependencies
RUN npm install

# Copy source code
COPY . .

# Stage 2: Final Production Image
FROM node:20-alpine

WORKDIR /app

# Copy node_modules and built assets from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app ./

# Expose the application port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["npm", "run", "start"]
