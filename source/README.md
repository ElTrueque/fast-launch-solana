# Fast Launch Solana: exact source reproduction

Program: `BtFP1XpKdZgAiivKJQ6pFr1fuHpeNTHhjyskDbSUtHqj` (Solana mainnet).

Expected ELF: 87,160 bytes, SHA-256 `7db37174011a0a5736cae8558ddc81ae48dfdb0f58ce62ef0dff182064ed659d`.

This package preserves the exact original Rust sources, Cargo.lock, vendored dependencies and compiled ELF. A clean Windows rebuild on 2026-10-05 reproduced the complete ELF byte-for-byte, using Anza platform-tools v1.57 and source-path remapping. The remapping restores the source paths already embedded in the deployed ELF; it does not change program source or behavior. `manifest.json` records every compilation input and the tool binaries checked before running Cargo.

Reproduce on Windows, with Node.js 24 and the Windows x86_64 platform-tools v1.57 archive extracted into a directory containing `rust` and `llvm`:

```powershell
node scripts/check-mainnet.mjs --self-test
node scripts/reproduce-windows.mjs C:/path/to/platform-tools --original-paths
node scripts/check-mainnet.mjs
```

The first two commands use no network. The last command only reads Solana mainnet, using `getGenesisHash` and a single finalized `getMultipleAccounts` snapshot. It checks loader ownership, executable state, the program-to-ProgramData link, upgrade authority, exact ELF bytes and zero-only padding. No signing or wallet software is used. An optional `SOLANA_RPC_URL` environment variable can select another RPC endpoint.

The reference deployment report is dated 2026-10-04; it is historical evidence. A successful current check writes `evidence/runtime-finalized.json`. An RPC timeout or failure does not establish a match.

The platform archive comes from https://github.com/anza-xyz/platform-tools/releases/tag/v1.57 and must have SHA-256 `792bc821f006e2b56aee31640110b449d5dc89f1305f16f24037465ab8cd7d5a`. The build uses Rust `ae660768a`, Cargo `bbbd3a760`, target `sbpfv3-solana-solana`, `--offline --locked --release`, `panic=abort`, target CPU v3, LTO and the release settings already present in the original Cargo.toml.

Public reproducibility and an OtterSec/explorer verified badge are separate. This Windows recipe proves exact reproduction. It is not a claim that OtterSec has accepted a Linux/Docker build, a verification PDA, or a remote job. No deployment, upgrade or authority change is part of this package.
