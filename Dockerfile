FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY package.json ./
COPY src ./src
COPY public ./public
COPY README.md ./
COPY .env.example ./

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((res) => { if (!res.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
