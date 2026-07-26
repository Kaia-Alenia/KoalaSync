FROM node:24-alpine
WORKDIR /app

# Copy shared protocol first
COPY --chown=node:node shared/ ./shared/

# Copy server
COPY --chown=node:node server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY --chown=node:node server/ ./server/

WORKDIR /app/server
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
CMD ["node", "index.js"]
