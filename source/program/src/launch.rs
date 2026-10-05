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
// Accounts: payer, launch, new mint, quote mint, config, quote config,
// payer token A/B, PDA token A/B, metadata, metadata program, treasury,
// token, quote program, Token2022, ATA, system, DAMM, pool authority,
// pool, position, NFT mint, NFT account, pool vault A/B, event authority,
// token-A badge placeholder, token-B badge (DAMM validates optional badges).
#[inline(never)]
pub fn create(p:&Address,a:&mut[AccountView],d:&[u8])->ProgramResult{
    check(a.len()==29&&d.len()>=40,130)?;
    check(a[0].is_signer()&&a[2].is_signer()&&a[22].is_signer(),130)?;
    for(i,k)in [(11,METADATA),(12,TREASURY),(13,TOKEN),(15,TOKEN2022),(16,ATA),(17,SYSTEM),(18,METEORA)]{check(a[i].address()==&k,130)?;}
    let mode=d[1];let fee=d[2];let sqrt=u128at(d,3)?;let liquidity=u128at(d,19)?;
    let nl=d[35]as usize;let sl=d[36]as usize;let ul=u16::from_le_bytes([d[37],d[38]])as usize;
    check(mode<=1&&(1..=5).contains(&fee)&&liquidity>0&&nl>0&&nl<=32&&sl>0&&sl<=10&&ul>=8&&ul<=200&&d.len()==39+nl+sl+ul,131)?;
    let name=&d[39..39+nl];let symbol=&d[39+nl..39+nl+sl];let uri=&d[39+nl+sl..];
    check(core::str::from_utf8(name).is_ok()&&core::str::from_utf8(symbol).is_ok()&&core::str::from_utf8(uri).is_ok()&&uri.starts_with(b"ipfs://"),131)?;
    check(a[4].owned_by(p)&&a[4].data_len()==104&&a[4].address()==&Address::find_program_address(&[b"config"],p).0,132)?;
    let (reward_signer,jar_signer)={let b=a[4].try_borrow()?;(address(&b,40),address(&b,72))};
    let quote=*a[3].address();check(a[5].owned_by(p)&&a[5].data_len()==112&&a[5].address()==&Address::find_program_address(&[b"quote",quote.as_ref()],p).0,132)?;
    {let q=a[5].try_borrow()?;check(&q[..8]==b"ETFQUO01"&&q[104]==1&&&q[8..40]==quote.as_ref()&&&q[40..72]==a[14].address().as_ref()&&sqrt>=u128at(&q,72)?&&sqrt<=u128at(&q,88)?,132)?;}
    quote_mint(&a[3],a[14].address())?;
    let m=*a[2].address();let (state,bump)=Address::find_program_address(&[b"launch",m.as_ref()],p);check(a[1].address()==&state,133)?;
    let bb=[bump];let seeds=[Seed::from(b"launch"),Seed::from(m.as_ref()),Seed::from(&bb)];let signs=[Signer::from(&seeds)];
    create_from_wallet(&a[1],STATE_LEN,p,&a[0],&signs)?;
    create_from_wallet(&a[2],82,&TOKEN,&a[0],&[])?;
    let mut init=[0u8;35];init[0]=20;init[1]=6;init[2..34].copy_from_slice(state.as_ref());
    invoke(&TOKEN,[&a[2]],[(true,false)],&init,&[])?;
    for(target,owner,mint,t)in [(6,0,2,13),(7,0,3,14),(8,1,2,13),(9,1,3,14)]{ata(&a[0],&a[target],&a[owner],&a[mint],&a[17],&a[t])?;}
    // DAMM requires one atomic quote unit even at the one-sided boundary.
    // Wrap precisely one lamport for SOL; ERC/SPL quote inventory is user-owned.
    if quote==WSOL {transfer_sol(&a[0],&a[7],1,&[])?;invoke(&TOKEN,[&a[7]],[(true,false)],&[17],&[])?;}
    check(token_amount(&a[7],&quote,a[0].address(),a[14].address())?>=1,136)?;
    let mut mint=[0u8;9];mint[0]=7;put64(&mut mint,1,SUPPLY);
    invoke(&TOKEN,[&a[2],&a[6],&a[1]],[(true,false),(true,false),(false,true)],&mint,&signs)?;
    metadata(a,name,symbol,uri,&signs)?;
    // Revoke mint authority; freeze authority was never set.
    invoke(&TOKEN,[&a[2],&a[1]],[(true,false),(false,true)],&[6,0,0],&signs)?;
    // DAMM token A is always the new mint, token B the allowed quote.
    // Pool PDA sorting is independent of these two roles.
    let mut ix=[0u8;107];ix[..8].copy_from_slice(&[20,161,241,24,189,221,180,2]);
    put64(&mut ix,8,900_000_000);ix[16..18].copy_from_slice(&5u16.to_le_bytes());put64(&mut ix,18,1);
    put64(&mut ix,26,(900_000_000-fee as u64*10_000_000)/5);
    // bytes 34..39: linear, no compounding, no dynamic fee.
    ix[39..55].copy_from_slice(&sqrt.to_le_bytes());ix[55..71].copy_from_slice(&MAX_SQRT.to_le_bytes());
    ix[72..88].copy_from_slice(&liquidity.to_le_bytes());ix[88..104].copy_from_slice(&sqrt.to_le_bytes());ix[104]=1;ix[105]=1;
    invoke(&METEORA,[&a[1],&a[22],&a[23],&a[0],&a[19],&a[20],&a[21],&a[2],&a[3],&a[24],&a[25],&a[6],&a[7],&a[13],&a[14],&a[15],&a[17],&a[26],&a[18],&a[27],&a[28]],
        [(false,false),(true,true),(true,false),(true,true),(false,false),(true,false),(true,false),(false,false),(false,false),(true,false),(true,false),(true,false),(true,false),(false,false),(false,false),(false,false),(false,false),(false,false),(false,false),(false,false),(false,false)],&ix,&[])?;
    let dust=token_amount(&a[6],&m,a[0].address(),&TOKEN)?;check(dust<=1,134)?;
    if dust>0{transfer(&a[6],&a[2],&a[8],&a[0],dust,&TOKEN,&[])?;}
    let mut lock=[0u8;24];lock[..8].copy_from_slice(&[165,176,125,6,231,171,186,213]);lock[8..].copy_from_slice(&liquidity.to_le_bytes());
    invoke(&METEORA,[&a[20],&a[21],&a[23],&a[1],&a[26],&a[18]],[(true,false),(true,false),(false,false),(false,true),(false,false),(false,false)],&lock,&signs)?;
    transfer_sol(&a[0],&a[12],23_000_000,&[])?;
    let copied=[(8,*a[0].address()),(40,*a[2].address()),(72,*a[3].address()),(104,*a[14].address()),(136,*a[20].address()),(168,*a[21].address()),(200,*a[22].address())];
    let mut s=a[1].try_borrow_mut()?;s[..8].copy_from_slice(b"ETFAST01");
    for(o,k)in copied{key(&mut s,o,&k);}key(&mut s,232,&reward_signer);key(&mut s,384,&jar_signer);
    put64(&mut s,296,dust);put64(&mut s,304,Clock::get()?.unix_timestamp as u64);s[312]=mode;s[313]=fee;s[314]=bump;
    s[320..336].copy_from_slice(&sqrt.to_le_bytes());s[336..352].copy_from_slice(&liquidity.to_le_bytes());put64(&mut s,352,Clock::get()?.slot);Ok(())
}
#[inline(never)]
fn metadata(a:&[AccountView],name:&[u8],symbol:&[u8],uri:&[u8],signs:&[Signer])->ProgramResult{
    let expected=Address::find_program_address(&[b"metadata",METADATA.as_ref(),a[2].address().as_ref()],&METADATA).0;check(a[10].address()==&expected,135)?;
    let mut b=[0u8;280];b[0]=33;let mut o=1;
    for s in [name,symbol,uri]{b[o..o+4].copy_from_slice(&(s.len()as u32).to_le_bytes());o+=4;b[o..o+s.len()].copy_from_slice(s);o+=s.len();}
    // sellerFeeBps=0; creators/collection/uses=None; isMutable=false; collectionDetails=None.
    o+=7;
    invoke(&METADATA,[&a[10],&a[2],&a[1],&a[0],&a[1],&a[17]],[(true,false),(false,false),(false,true),(true,true),(false,true),(false,false)],&b[..o],signs)
}
