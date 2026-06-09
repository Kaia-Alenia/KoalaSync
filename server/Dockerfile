FROM node:20-alpine
WORKDIR /app

# Copy shared protocol first
COPY shared/ ./shared/

# Copy server
COPY server/package*.json ./server/
RUN cd server && npm install --production
COPY server/ ./server/

WORKDIR /app/server
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
CMD ["node", "index.js"]
