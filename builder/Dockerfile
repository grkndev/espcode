FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl python3 xz-utils \
    && rm -rf /var/lib/apt/lists/*

ARG ARDUINO_CLI_VERSION=1.1.1
RUN curl -fsSL "https://downloads.arduino.cc/arduino-cli/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz" \
    | tar -xz -C /usr/local/bin arduino-cli \
 && chmod +x /usr/local/bin/arduino-cli

RUN useradd -m -u 10001 builder
WORKDIR /app
COPY --chown=builder:builder package*.json ./
RUN npm ci --omit=dev
COPY --chown=builder:builder src ./src
COPY --chown=builder:builder warmup ./warmup
USER builder
CMD ["node", "src/worker.js"]
