#!/usr/bin/bash

solana-test-validator \
--upgradeable-program 5enTNrkEghWJHXCbXzbbTWUTvx9YFP7nQ4n1SHgbZmLh ./target/deploy/asset_router.so "$DEPLOYER" \
--upgradeable-program E1p8P6TTe8QvKmSK7QZ3n7HtQY9hE1p9JrCwLrXnPUfn ./target/deploy/bascule.so "$DEPLOYER" \
--upgradeable-program 2Zp4V3e64T5zNggMe75UdVPPBYxCvL9kFyd2LkJByjTj ./target/deploy/consortium.so "$DEPLOYER" \
--upgradeable-program LomP48F7bLbKyMRHHsDVt7wuHaUQvQnVVspjcbfuAek ./target/deploy/lbtc.so "$DEPLOYER" \
--upgradeable-program 3TfSFMuw31Je57m5Wcd9ZopGzjrHLHkjh292aEwXvm3h ./target/deploy/mailbox.so "$DEPLOYER" \
--upgradeable-program CEL52cw8nR3woiKqm1ETzifdQqECwD3DBkLiAuQrrY43 ./target/deploy/mailbox_receiver.so "$DEPLOYER" \
--mint "$DEPLOYER"