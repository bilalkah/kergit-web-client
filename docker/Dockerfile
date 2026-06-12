FROM node:20.19.6-bookworm-slim

ENV COREPACK_ENABLE=0
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Native build deps
RUN apt-get update && apt-get install -y \
    bash \
    ca-certificates \
    git \
    python3 \
    make \
    g++ \
    libc6 \
    && rm -rf /var/lib/apt/lists/*

# Pin pnpm explicitly
RUN npm install -g pnpm@10.27.0

# Workdir matches volume mount
WORKDIR /app/clients/web

# Do NOT copy project files
# node_modules will be created inside the mounted volume

EXPOSE 3000

CMD ["pnpm", "dev"]
