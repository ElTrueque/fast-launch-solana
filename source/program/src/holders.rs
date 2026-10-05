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
const EPOCH_LEN:usize=320;
// The public list is trusted to the pinned signer, exactly as in EVM. The
// program enforces authorization, immutable epochs, funding and one claim per
// wallet per epoch. It does not pretend to verify historical balances or USD.
#[inline(never)]
pub fn process(p:&Address,a:&mut[AccountView],d:&[u8])->ProgramResult{
    check(a.len()>=5,150)?;let mut s=state(p,&a[0])?;check(s[312]==1,150)?;
    let mint=address(&s,40);let q=address(&s,72);let qt=address(&s,104);let state_key=*a[0].address();
    if d[0]==5{
        // launch, payer, pinned snapshot signer, epoch, system.
        // data: seq, past snapshot slot, total, root, public IPFS URI.
        check(a.len()==5&&a[1].is_signer()&&a[2].is_signer()&&a[2].address()==&address(&s,232)&&a[4].address()==&SYSTEM&&d.len()>=60,151)?;
        let seq=read64(d,1)?;let slot=read64(d,9)?;let total=read64(d,17)?;let n=u16::from_le_bytes([d[57],d[58]])as usize;
        check(d.len()==59+n&&n<=200&&n>=8&&d[59..].starts_with(b"ipfs://")&&core::str::from_utf8(&d[59..]).is_ok(),151)?;
        check(seq==add(read64(&s,280)?,1)?&&slot<Clock::get()?.slot&&slot>=read64(&s,352)?&&slot>read64(&s,360)?&&total>0&&total<=read64(&s,264)?&&d[25..57].iter().any(|v|*v!=0),152)?;
        let sq=seq.to_le_bytes();let (e,b)=Address::find_program_address(&[b"epoch",state_key.as_ref(),&sq],p);check(a[3].address()==&e,152)?;
        let bb=[b];let seeds=[Seed::from(b"epoch"),Seed::from(state_key.as_ref()),Seed::from(sq.as_slice()),Seed::from(&bb)];
        create_from_wallet(&a[3],EPOCH_LEN,p,&a[1],&[Signer::from(&seeds)])?;
        {let mut x=a[3].try_borrow_mut()?;x[..8].copy_from_slice(b"ETFEP001");key(&mut x,8,&state_key);x[40..72].copy_from_slice(&d[25..57]);put64(&mut x,72,seq);put64(&mut x,80,slot);put64(&mut x,88,total);put64(&mut x,96,total);x[104..106].copy_from_slice(&(n as u16).to_le_bytes());x[106..106+n].copy_from_slice(&d[59..]);}
        let left=sub(read64(&s,264)?,total)?;put64(&mut s,264,left);put64(&mut s,280,seq);put64(&mut s,360,slot);a[0].try_borrow_mut()?.copy_from_slice(&s);return Ok(());
    }
    // launch, payer, epoch, beneficiary, receipt, quote vault, quote mint,
    // beneficiary ATA, quote token program, ATA, system.
    check(a.len()==11&&d.len()>=10&&d[0]==6&&a[1].is_signer()&&a[6].address()==&q&&a[8].address()==&qt&&a[9].address()==&ATA&&a[10].address()==&SYSTEM,153)?;
    let n=read64(d,1)?;let depth=d[9]as usize;check(n>0&&depth<=32&&d.len()==10+32*depth,153)?;
    check(a[2].owned_by(p)&&a[2].data_len()==EPOCH_LEN,153)?;
    let epoch:[u8;EPOCH_LEN]=a[2].try_borrow()?.as_ref().try_into().map_err(|_|ProgramError::InvalidAccountData)?;
    let sq=read64(&epoch,72)?.to_le_bytes();let ek=*a[2].address();let who=*a[3].address();
    check(&epoch[..8]==b"ETFEP001"&&&epoch[8..40]==state_key.as_ref()&&ek==Address::find_program_address(&[b"epoch",state_key.as_ref(),&sq],p).0&&n<=read64(&epoch,96)?,154)?;
    check(who!=state_key&&who!=INCINERATOR&&who!=SYSTEM,154)?;
    let mut leaf=[0u8;144];leaf[..8].copy_from_slice(b"ETFCLAIM");leaf[8..40].copy_from_slice(p.as_ref());leaf[40..72].copy_from_slice(state_key.as_ref());leaf[72..104].copy_from_slice(ek.as_ref());leaf[104..136].copy_from_slice(who.as_ref());put64(&mut leaf,136,n);
    let mut h=hash(&leaf);let mut pair=[0u8;64];
    for j in 0..depth{let sib:&[u8]=&d[10+32*j..42+32*j];if h.as_slice()<=sib{pair[..32].copy_from_slice(&h);pair[32..].copy_from_slice(sib);}else{pair[..32].copy_from_slice(sib);pair[32..].copy_from_slice(&h);}h=hash(&pair);}
    check(h==epoch[40..72],155)?;
    let (receipt,b)=Address::find_program_address(&[b"claim",ek.as_ref(),who.as_ref()],p);check(a[4].address()==&receipt,156)?;
    let bb=[b];let rs=[Seed::from(b"claim"),Seed::from(ek.as_ref()),Seed::from(who.as_ref()),Seed::from(&bb)];create_from_wallet(&a[4],80,p,&a[1],&[Signer::from(&rs)])?;
    ata(&a[1],&a[7],&a[3],&a[6],&a[10],&a[8])?;token_amount(&a[5],&q,&state_key,&qt)?;
    let sb=[s[314]];let signs=[Seed::from(b"launch"),Seed::from(mint.as_ref()),Seed::from(&sb)];transfer(&a[5],&a[6],&a[7],&a[0],n,&qt,&[Signer::from(&signs)])?;
    {let mut x=a[4].try_borrow_mut()?;x[..8].copy_from_slice(b"ETFCLM01");key(&mut x,8,&ek);key(&mut x,40,&who);put64(&mut x,72,n);}
    put64(&mut a[2].try_borrow_mut()?,96,sub(read64(&epoch,96)?,n)?);Ok(())
}
