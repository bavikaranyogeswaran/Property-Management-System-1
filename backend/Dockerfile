# Stage 1: Build Dependencies (Production Only)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Install only production dependencies for the final lean image
RUN npm ci --omit=dev

# Stage 2: Final Production Image
FROM node:20-alpine AS runner
WORKDIR /app

# Ensure required storage directories exist with correct permissions for 'node' user
RUN mkdir -p logs uploads && chown -R node:node /app

# Copy production dependencies from deps stage
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/package*.json ./

# Selective Whitelisting: Copy only required application directories and entry points
# This eliminates redundant Stage 1 source copies and prunes non-production files (tests, docs)
COPY --chown=node:node server.js ./
COPY --chown=node:node worker.js ./
COPY --chown=node:node config/ ./config/
COPY --chown=node:node controllers/ ./controllers/
COPY --chown=node:node middleware/ ./middleware/
COPY --chown=node:node migrations/ ./migrations/
COPY --chown=node:node models/ ./models/
COPY --chown=node:node queues/ ./queues/
COPY --chown=node:node routes/ ./routes/
COPY --chown=node:node schemas/ ./schemas/
COPY --chown=node:node services/ ./services/
COPY --chown=node:node utils/ ./utils/
COPY --chown=node:node database/ ./database/
COPY --chown=node:node knexfile.js ./

# Switch to non-privileged user for security (Zero-Trust)
USER node

# Expose the application port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Healthcheck: Verify the server is accepting traffic
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the application
# Now includes automatic migrations on start for environment parity
CMD ["npm", "run", "start"]
