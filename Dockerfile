# ==============================================================================
# Audio Forge Production Dockerfile
# Optimized for persistent deployment on Render, Fly.io, Railway, or AWS ECS
# ==============================================================================

FROM node:22-bookworm-slim

# Install system dependencies needed for Piper and networking
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    tar \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Pre-bake standalone Piper TTS C++ binary (zero cold-start latency)
RUN mkdir -p /app/.piper && \
    curl -sSL "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz" | tar -xz -C /app/.piper && \
    chmod +x /app/.piper/piper/piper

# 2. Pre-bake default voice model (en_US-lessac-low)
RUN mkdir -p /app/models && \
    curl -sSL -o /app/models/en_US-lessac-low.onnx.json "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/low/en_US-lessac-low.onnx.json" && \
    curl -sSL -o /app/models/en_US-lessac-low.onnx "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/low/en_US-lessac-low.onnx"

# 3. Install NPM dependencies
COPY package*.json tsconfig.json ./
RUN npm install

# 4. Copy application source and build TypeScript bundle
COPY src ./src
COPY bin ./bin
RUN npm run build && chmod +x ./bin/audio-forge.js

# Ensure output directory exists
RUN mkdir -p /app/output

# Default environment variables
ENV PORT=3000
ENV NODE_ENV=production
ENV PIPER_BIN=/app/.piper/piper/piper

EXPOSE 3000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the API gateway
CMD ["node", "bin/audio-forge.js", "serve"]
