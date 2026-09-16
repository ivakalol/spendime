FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node src/server.mjs ./src/server.mjs

USER node

EXPOSE 3000

CMD ["node", "src/server.mjs"]
