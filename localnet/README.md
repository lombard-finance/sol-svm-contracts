### Run tests with mocha:
Restart validator before each run.
1. Under wsl go to the project directory
2. Run the command:

`solana-test-validator --bpf-program 5WFmz89q5RzSezsDQNCWoCJTEdYgne5u26kJPCyWvCEx ./target/deploy/lbtc.so --mint Cgi3TVUK5to37NVhGCeeFLCEJbRxaCpgjKinoWxAbGEd --reset`

Where:
* `Cgi3TVUK5to37NVhGCeeFLCEJbRxaCpgjKinoWxAbGEd` is an account in solana config.

3. Run the tests using mocha plugin in IDE

### Run tests with mocha and solana validator in docker
1. Build dockerfile:

`just build-docker`

2. Build contracts:

`just build-contracts`

3. Set environment variables for Mocha in .env:

- ANCHOR_PROVIDER_URL=http://127.0.0.1:8899;
- ANCHOR_WALLET={!!!_PATH_TO_PROJECT_DIRECTORY_!!!}\localnet\id.json;
- PROGRAM_ID=LomP48F7bLbKyMRHHsDVt7wuHaUQvQnVVspjcbfuAek

4. Start solana validator with deployed contracts:
Check that localnet/start_clean.sh script set as default container command

`just solana-start`

5. Run the tests
`npx mocha --require ts-node/register/transpile-only --exit --timeout 60000 --ui bdd .\tests\*.ts`


### Deploy to solana test validator
1. Build dockerfile:

`just build-docker`

2. Build contracts:

`just build-contracts`

3. Run deploy script. The script sets valset from staging environment

`npx mocha --require ts-node/register/transpile-only ./localnet/lbtc_deploy.ts`

4. To get chainId decode genesis hash from base58 to hex and replace the first 2 characters with '02'