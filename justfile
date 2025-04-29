#!/usr/bin/env just --justfile

build-docker:
    docker build -t solana-validator . -f ./localnet/Dockerfile

build-contracts:
    docker run --rm \
    -v ./target:/contracts/target \
    solana-validator "anchor build"

solana-start:
    docker compose -f docker-compose.localnet.yml up -d
