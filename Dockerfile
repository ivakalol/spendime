FROM node:22-bookworm-slim AS base

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app

FROM base AS dependencies

ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
RUN npm run build

FROM dependencies AS test

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY tests ./tests
CMD ["npm", "test"]

FROM base AS production-dependencies

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS runner

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
