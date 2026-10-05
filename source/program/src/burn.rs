// SPDX-License-Identifier: MIT
/*
    ███████╗██╗
    ██╔════╝██║
    █████╗  ██║
    ██╔══╝  ██║
    ███████╗███████╗
    ╚══════╝╚══════╝

    ████████╗██████╗ ██╗   ██╗███████╗ ██████╗ ██╗   ██╗███████╗
    ╚══██╔══╝██╔══██╗██║   ██║██╔════╝██╔═══██╗██║   ██║██╔════╝
       ██║   ██████╔╝██║   ██║█████╗  ██║   ██║██║   ██║█████╗
       ██║   ██╔══██╗██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══╝
       ██║   ██║  ██║╚██████╔╝███████╗╚██████╔╝╚██████╔╝███████╗
       ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚══════╝

    FAST LAUNCH SOLANA | El Trueque | v1
    Web:       https://el-trueque.com
    X:         https://x.com/ElTruequeMarket
    Telegram:  https://t.me/eltruequeapp
    Instagram: https://instagram.com/eltruequeapp
    TikTok:    https://www.tiktok.com/@eltruequeapp
    Contact:   eltrueque@proton.me

    Program source branding; independent Meteora DAMM v2 integration.
    This comment does not change token metadata or program permissions.
*/
use super::*;

// Irreversible transfer to the canonical Solana incinerator. The issued supply
// stays fixed; the amount is removed from circulation. Neither the launch PDA
// nor the treasury receives these tokens. No allowance or delegated authority.
// Accounts: launch, holder/payer signer, holder token account, launch mint,
// incinerator, incinerator ATA, classic Token, ATA, System.
// Data: 7 + amount (u64). Decimal rounding is computed exactly by the client.
#[inline(never)]
pub fn process(p: &Address, a: &mut [AccountView], d: &[u8]) -> ProgramResult {
    check(a.len() == 9 && d.len() == 9 && a[1].is_signer(), 160)?;
    let mut s = state(p, &a[0])?;
    let mint = address(&s, 40);
    let n = read64(d, 1)?;
    check(n > 0 && a[3].address() == &mint && a[4].address() == &INCINERATOR
        && a[6].address() == &TOKEN && a[7].address() == &ATA
        && a[8].address() == &SYSTEM, 160)?;
    check(token_amount(&a[2], &mint, a[1].address(), &TOKEN)? >= n, 161)?;
    ata(&a[1], &a[5], &a[4], &a[3], &a[8], &a[6])?;
    transfer(&a[2], &a[3], &a[5], &a[1], n, &TOKEN, &[])?;
    let total = add(read64(&s, 368)?, n)?;
    put64(&mut s, 368, total);
    a[0].try_borrow_mut()?.copy_from_slice(&s);
    Ok(())
}
