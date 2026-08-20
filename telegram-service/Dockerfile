FROM node:20-bookworm-slim

# prebuilt-tdlib traz o binário libtdjson pronto; só precisamos das libs de sistema.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libssl3 zlib1g \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV TDLIB_DATA_DIR=/data/tdlib
ENV PORT=8080

VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "src/server.js"]
