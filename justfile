#!/usr/bin/env just --justfile

build-docker:
    docker build -t solana-validator . -f ./localnet/Dockerfile

build-contracts:
    rm -rf target/*
    docker run --rm \
    -v ./programs:/contracts/programs \
    -v ./dependencies:/contracts/dependencies \
    -v ./Anchor.toml:/contracts/Anchor.toml \
    -v ./Cargo.lock:/contracts/Cargo.lock \
    -v ./Cargo.toml:/contracts/Cargo.toml \
    -v ./target:/contracts/target \
    solana-validator "anchor build"

solana-start:
    docker compose -f docker-compose.localnet.yml up -d

solana-stop:
    docker compose -f docker-compose.localnet.yml down