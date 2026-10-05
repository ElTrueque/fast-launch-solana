# El Trueque Fast Launch — Solana sources

Public source package and exact reproduction recipe for the existing mainnet program:

`BtFP1XpKdZgAiivKJQ6pFr1fuHpeNTHhjyskDbSUtHqj`

**Public source verification completed on 5 October 2026.** OtterSec's [program status](https://verify.osec.io/status/BtFP1XpKdZgAiivKJQ6pFr1fuHpeNTHhjyskDbSUtHqj) and [authority-specific status](https://verify.osec.io/status-all/BtFP1XpKdZgAiivKJQ6pFr1fuHpeNTHhjyskDbSUtHqj) both returned `is_verified: true`. The [remote build job](https://verify.osec.io/job/39138bbc-e4ab-4974-b6ae-2774cd3856a7) completed with matching executable and on-chain hashes for [source commit ae52f73](https://github.com/ElTrueque/fast-launch-solana/tree/ae52f73dcf854cc1e7c7e2c1ffa2ae714ad0ccc4). See [remote-verification-summary.json](remote-verification-summary.json) for the compact evidence record.

The complete Rust sources, pinned dependencies, original ELF, build instructions and evidence are in [source-package.zip](source-package.zip). Archive integrity and verification results are recorded in [bundle-manifest.json](bundle-manifest.json).

Expected program ELF: **87,160 bytes**. SHA-256:

```text
7db37174011a0a5736cae8558ddc81ae48dfdb0f58ce62ef0dff182064ed659d
```

[GitHub Actions run 37292117758](https://github.com/ElTrueque/fast-launch-solana/actions/runs/37292117758) passed on 5 October 2026 at commit `f7f579b9ebdac635a76b063d691164488531071b`. A clean Windows build reproduced the complete original ELF, then the finalized mainnet account check passed. The [evidence artifact](https://github.com/ElTrueque/fast-launch-solana/actions/runs/37292117758/artifacts/11336642240) contains the build result, compiler logs, rebuilt ELF and RPC result.

The recipe uses Anza platform-tools v1.57, Cargo.lock, vendored sources and source-path remapping for paths embedded in the original ELF. It changes no Rust program source. The source ZIP remains unchanged from its original publication; later results are recorded here and in the bundle manifest.

Run the manual **Reproduce Fast Solana and check mainnet** workflow under [Actions](https://github.com/ElTrueque/fast-launch-solana/actions) to repeat the check. It validates the source archive and toolchain hashes, compiles offline from clean inputs, compares the complete ELF, then checks current finalized mainnet accounts. A recorded passing run is evidence at its execution time; repeat it to check a later deployment state.

For local reproduction, extract the archive and follow its README. The mainnet check uses only `getGenesisHash` and `getMultipleAccounts`; no wallet, signing key, transaction submission, deployment or program upgrade is involved.

[Linux run 37294234159](https://github.com/ElTrueque/fast-launch-solana/actions/runs/37294234159) also passed on 5 October 2026 at commit `295d014b5b1ba128799cfd3bf75d21bee3628f18`: complete ELF equality and finalized mainnet checks both succeeded. It uses the Linux v1.57 compiler/linker with the original Windows distribution's SBPF target libraries, preserving the original compiler-builtins metadata. Both official archives and all 50 target-library files are hash-checked before a fresh offline build. No Rust source or ELF patching is involved.

The exact expanded sources are also browsable in [source/](source/) at commit `ae52f73dcf854cc1e7c7e2c1ffa2ae714ad0ccc4`.

[Container run 37295679162](https://github.com/ElTrueque/fast-launch-solana/actions/runs/37295679162) passed using the official `solana-verify` 0.5.1 build command, followed by complete ELF equality and finalized mainnet checks. Its transparent [Docker recipe](Dockerfile.otter) and [build adapter](cargo-build-sbf.mjs) compile the sources afresh; the reference ELF is never used as the build output. The public compiler image is pinned by content digest:

```text
ghcr.io/eltrueque/fast-launch-solana-builder@sha256:9a2afd0a1a847179919bf0ab484f54cda08bf537d88bf18d9ea8204feaf38a8f
```

The upgrade authority signed the verification metadata, finalized at slot `453557597` in [this transaction](https://explorer.solana.com/tx/52DgKepzJxyxe2ky7dtGnma85Tmqa7E7b9XjVd945wUMNPNSyZBwNFZVCvUPz1rKbuQBfSVu83kEFGaRChHQnDFx). OtterSec then rebuilt the pinned sources with the pinned public image. The [final status-only CI run](https://github.com/ElTrueque/fast-launch-solana/actions/runs/37300589215), at commit `915981248bebbd15e2525067c3b1535a05ae4a43`, confirmed the completed job, both public verification statuses and the finalized metadata/program accounts. Its [evidence artifact](https://github.com/ElTrueque/fast-launch-solana/actions/runs/37300589215/artifacts/11341347185) preserves those responses. This final check submitted no transaction or new build request.

OtterSec and `solana-verify` compare SHA-256 after removing trailing zero bytes. Their matching executable/on-chain hash is:

```text
d05bae619e04ee166de5a6b7ba6d58c6b85efb988291f8ad67e5f245ca5e4c1b
```

That normalized hash differs from the complete 87,160-byte ELF hash shown above. Both comparisons passed; the compiled ELF was not patched. Public source verification establishes the deployed code's reproducibility. Functional launch, payment and transfer tests are a separate scope. See the [official Solana verified-build guide](https://solana.com/docs/programs/verified-builds).
