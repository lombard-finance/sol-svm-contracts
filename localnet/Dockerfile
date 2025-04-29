FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    libudev-dev \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

# Rust
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain 1.85.0
ENV PATH="/root/.cargo/bin:${PATH}"
ENV CARGO_HOME=/root/.cargo
ENV CARGO_TARGET_DIR=/contracts/target

# Anchor version manager
RUN cargo install --git https://github.com/coral-xyz/anchor avm --force
RUN avm install 0.31.0

# Solana
RUN sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.0/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:$PATH"
RUN solana config set --url http://0.0.0.0:8899
RUN solana config set --ws ws://0.0.0.0:8900

# Node
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global yarn

# Certificate for mockserver
ADD https://raw.githubusercontent.com/mock-server/mockserver/refs/heads/master/mockserver-core/src/main/resources/org/mockserver/socket/CertificateAuthorityCertificate.pem \
    /usr/local/share/ca-certificates/mockserver-cert.crt
RUN update-ca-certificates

# Project
WORKDIR /contracts
COPY . /contracts
COPY localnet/id.json /root/.config/solana/

RUN cargo update
RUN yarn -i

EXPOSE 8899 8900

ENTRYPOINT ["/bin/bash", "-c"]