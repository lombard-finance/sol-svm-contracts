#!/usr/bin/bash

solana-test-validator \
--upgradeable-program LomP48F7bLbKyMRHHsDVt7wuHaUQvQnVVspjcbfuAek ./target/deploy/lbtc.so "$DEPLOYER" \
--upgradeable-program E1p8P6TTe8QvKmSK7QZ3n7HtQY9hE1p9JrCwLrXnPUfn ./target/deploy/bascule.so "$DEPLOYER" \
--mint "$DEPLOYER" \

