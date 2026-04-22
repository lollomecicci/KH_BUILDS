FROM node:20-alpine

WORKDIR /app

# Install deps (layer separato per cache)
COPY local-backend/package*.json ./local-backend/
RUN cd local-backend && npm ci --omit=dev

# Copia tutto il progetto (index.html servito come static)
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "local-backend/server.js"]
