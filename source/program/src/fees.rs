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
// Claim always credits first. Withdrawal is a separate transaction, so a frozen
// recipient or paused quote cannot revert already collected fees or lose credit.
// 3: launch, PDA A/B ATA, mint A/B, pool, position, NFT account,
// pool authority, pool A/B vaults, token A/B programs, event authority, DAMM.
#[inline(never)]
pub fn process(p:&Address,a:&mut[AccountView],d:&[u8])->ProgramResult{
    check(!a.is_empty(),140)?;let mut s=state(p,&a[0])?;
    let m=address(&s,40);let q=address(&s,72);let qt=address(&s,104);let bb=[s[314]];
    let ss=[Seed::from(b"launch"),Seed::from(m.as_ref()),Seed::from(&bb)];let signs=[Signer::from(&ss)];
    if d==[3]{check(a.len()==15,141)?;
        for(i,k)in [(3,m),(4,q),(5,address(&s,136)),(6,address(&s,168)),(11,TOKEN),(12,qt),(14,METEORA)]{check(a[i].address()==&k,141)?;}
        let before=token_amount(&a[2],&q,a[0].address(),&qt)?;token_amount(&a[1],&m,a[0].address(),&TOKEN)?;
        invoke(&METEORA,[&a[8],&a[5],&a[6],&a[1],&a[2],&a[9],&a[10],&a[3],&a[4],&a[7],&a[0],&a[11],&a[12],&a[13],&a[14]],
            [(false,false),(false,false),(true,false),(true,false),(true,false),(true,false),(true,false),(false,false),(false,false),(false,false),(false,true),(false,false),(false,false),(false,false),(false,false)],&[180,38,154,17,133,33,162,211],&signs)?;
        let earned=sub(token_amount(&a[2],&q,a[0].address(),&qt)?,before)?;
        // Carry the odd atomic unit between claims: cumulative split differs by at most one.
        let combined=add(earned,s[315]as u64)?;let creator=combined/2;s[315]=(combined%2)as u8;
        let c=add(read64(&s,264)?,creator)?;let t=add(read64(&s,272)?,earned-creator)?;put64(&mut s,264,c);put64(&mut s,272,t);
        a[0].try_borrow_mut()?.copy_from_slice(&s);return Ok(());
    }
    // 4: launch, payer, quote escrow, quote mint, beneficiary, beneficiary ATA,
    // quote token program, ATA program, system. No beneficiary signature.
    check(d.len()==2&&d[0]==4&&d[1]<=1&&a.len()==9,142)?;
    let owner=if d[1]==0{check(s[312]==0,142)?;address(&s,8)}else{TREASURY};let offset=if d[1]==0{264}else{272};
    check(a[3].address()==&q&&a[4].address()==&owner&&a[6].address()==&qt&&a[7].address()==&ATA&&a[8].address()==&SYSTEM,142)?;
    token_amount(&a[2],&q,a[0].address(),&qt)?;let n=read64(&s,offset)?;check(n>0,143)?;
    ata(&a[1],&a[5],&a[4],&a[3],&a[8],&a[6])?;
    transfer(&a[2],&a[3],&a[5],&a[0],n,&qt,&signs)?;
    put64(&mut s,offset,0);a[0].try_borrow_mut()?.copy_from_slice(&s);Ok(())
}
