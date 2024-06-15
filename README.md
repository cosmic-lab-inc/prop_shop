# Drift Vaults

soon^TM

[did you see the CLI?](./ts/sdk/README.md) and the [wiki?](https://github.com/drift-labs/drift-vaults/wiki)

## Install Dependencies

If you don't have Anchor Version Manager (AVM) installed run:

```shell
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
```

If you don't have anchor `0.29.0` installed run:

```shell
avm install 0.29.0
```

If you don't have cargo make installed run:

```shell
cargo install cargo-make
```

## Build

Set versions for build dependencies:

```shell
cargo make setup
```

First assert that cargo compiles the project:

```shell
cargo build
```

Next assert that anchor can compile. On MacOS this is where you might get hung up:

```shell
anchor build
```

If on MacOS and you get an error compiling the `blake` crate that mentions something like `someHeaderFile.h not found`,
then try linking `/usr/include` which newer versions of MacOS don't symlink by default to compile C code:

```shell
sudo ln -s /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/* /usr/local/include/
```

## Run tests

```shell
cd ts && yarn && cd sdk && yarn && yarn build

cd .. && export ANCHOR_WALLET=~/.config/solana/id.json && anchor test
```

## Future Work

Use vault to interact with Phoenix: [here](https://github.com/drift-labs/drift-vaults/blob/wphan/phoenix-tests/tests/vaultPhoenix.ts)
