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

RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain 1.85.0
ENV PATH="/root/.cargo/bin:${PATH}"

RUN cargo install --git https://github.com/coral-xyz/anchor avm --force
RUN avm install 0.31.0

RUN sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.0/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:$PATH"

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /contracts
COPY . /contracts
COPY localnet/id.json /root/.config/solana/

RUN cargo update

RUN solana config set --url http://localhost:8899
RUN solana config set --ws ws://localhost:8900

RUN npm install --global yarn
RUN yarn -i

EXPOSE 8899 8900

ENTRYPOINT ["/bin/bash", "-c"]