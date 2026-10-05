FROM node:22-bookworm

WORKDIR /app

RUN test "$(dpkg --print-architecture)" = amd64 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates curl util-linux libopengl0 libgl1 libegl1 libfontconfig1 \
      libharfbuzz0b libasound2 libglib2.0-0 libpipewire-0.3-0 libjack-jackd2-0 \
    && curl -fL --retry 3 \
      https://github.com/musescore/MuseScore/releases/download/v4.7.5/MuseScore-Studio-4.7.5.260831071-x86_64.AppImage \
      -o /tmp/musescore.AppImage \
    && echo "a31b2da2dbcc2191bcc98beb7be5c15f2f517bedb3444def96fe3088b74d3a1e  /tmp/musescore.AppImage" | sha256sum -c - \
    && chmod +x /tmp/musescore.AppImage \
    && /tmp/musescore.AppImage --appimage-extract > /dev/null \
    && mv squashfs-root /opt/musescore \
    && rm /tmp/musescore.AppImage \
    && rm -rf /var/lib/apt/lists/*

ENV LUMAKEYS_MUSESCORE_PATH=/opt/musescore/bin/mscore4portable
RUN MU_QT_QPA_PLATFORM=offscreen QT_QPA_PLATFORM=offscreen "$LUMAKEYS_MUSESCORE_PATH" --version

COPY package*.json ./
COPY scripts ./scripts
ENV LUMAKEYS_SKIP_ELECTRON_REBUILD=1
RUN npm ci
RUN npm rebuild better-sqlite3

COPY electron.vite.config.ts vite.web.config.ts tsconfig.json tsconfig.server.json vite-env.d.ts ./
COPY src ./src
COPY public ./public

RUN npm run build:web

ENV PORT=3001
ENV LUMAKEYS_DATA_DIR=/data

EXPOSE 3001

CMD ["npm", "run", "start:web"]
