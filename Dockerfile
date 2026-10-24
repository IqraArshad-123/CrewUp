FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build:api && npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/shared/dist ./shared/dist
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/client/.next ./client/.next
COPY --from=build /app/client/next.config.mjs ./client/next.config.mjs
RUN mkdir -p /app/server/.data/private && chown -R node:node /app/server/.data
USER node
EXPOSE 3000
CMD ["npm", "run", "start:web"]
