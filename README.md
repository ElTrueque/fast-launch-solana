# El Trueque Fast Launch — Solana sources

Public source package and exact reproduction recipe for the existing mainnet program:

`BtFP1XpKdZgAiivKJQ6pFr1fuHpeNTHhjyskDbSUtHqj`

The complete Rust sources, pinned dependencies, original ELF, build instructions and evidence are in [source-package.zip](source-package.zip). Archive integrity is recorded in [bundle-manifest.json](bundle-manifest.json).

Expected program ELF: **87,160 bytes**. SHA-256:

```text
7db37174011a0a5736cae8558ddc81ae48dfdb0f58ce62ef0dff182064ed659d
```

A clean Windows build on 5 October 2026 reproduced those exact bytes. The recipe uses Anza platform-tools v1.57, Cargo.lock, vendored sources and source-path remapping for the paths embedded in the original ELF. It changes no Rust program source.

Run the manual **Reproduce Fast Solana and check mainnet** workflow under [Actions](https://github.com/ElTrueque/fast-launch-solana/actions). It validates the source archive and toolchain hashes, compiles offline from clean inputs, compares the complete ELF, then checks current finalized mainnet accounts. Download its evidence artifact to inspect the build result, logs and RPC result. A failed or missing run is not confirmation of verification.

For local reproduction, extract the archive and follow its README. The mainnet check uses only `getGenesisHash` and `getMultipleAccounts`; no wallet, signing key, transaction submission, deployment or program upgrade is involved.

This repository demonstrates source reproducibility. It does **not** claim an OtterSec/explorer verified badge. That separate process still needs a compatible verified-build recipe, on-chain verification metadata and a successful remote build. See the [official Solana verified-build guide](https://solana.com/docs/programs/verified-builds).
