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
// EL TRUEQUE | FAST LAUNCH SOLANA | https://el-trueque.com
// Independent DAMM v2 integration. No Mini Launch/community-program instructions.
#![no_std]
use pinocchio::{AccountView,Address,ProgramResult,error::ProgramError,cpi::{Seed,Signer},sysvars::{Sysvar,clock::Clock}};
mod ids; mod sol; mod launch; mod fees; mod holders; mod burn; mod jar;
use ids::*; use sol::*;
pinocchio::program_entrypoint!(process_instruction);
pinocchio::no_allocator!();pinocchio::nostd_panic_handler!();
pub const SUPPLY:u64=1_000_000_000_000;
pub const STATE_LEN:usize=416;
pub const MAX_SQRT:u128=79226673521066979257578248091;
pub const MIN_SQRT:u128=4295048016;
#[inline(never)]
fn process_instruction(p:&Address,a:&mut[AccountView],d:&[u8])->ProgramResult{
    match d.first(){Some(0..=1)=>config(p,a,d),Some(2)=>launch::create(p,a,d),Some(3..=4)=>fees::process(p,a,d),Some(5..=6)=>holders::process(p,a,d),Some(7)=>burn::process(p,a,d),Some(8..=9)=>jar::process(p,a,d),_=>Err(ProgramError::InvalidInstructionData)}
}
#[repr(C)] struct Slice{ptr:*const u8,len:u64}
pub fn hash(d:&[u8])->[u8;32]{let s=Slice{ptr:d.as_ptr(),len:d.len()as u64};let mut out=[0u8;32];unsafe{solana_define_syscall::definitions::sol_keccak256((&s as *const Slice).cast(),1,out.as_mut_ptr());}out}
pub fn u128at(d:&[u8],o:usize)->Result<u128,ProgramError>{Ok(u128::from_le_bytes(d.get(o..o+16).ok_or(ProgramError::InvalidInstructionData)?.try_into().map_err(|_|ProgramError::InvalidInstructionData)?))}
pub fn key(d:&mut[u8],o:usize,k:&Address){d[o..o+32].copy_from_slice(k.as_ref())}
pub fn state(p:&Address,a:&AccountView)->Result<[u8;STATE_LEN],ProgramError>{
    check(a.owned_by(p)&&a.data_len()==STATE_LEN,110)?;
    let d:[u8;STATE_LEN]=a.try_borrow()?.as_ref().try_into().map_err(|_|ProgramError::InvalidAccountData)?;
    check(&d[..8]==b"ETFAST01"&&a.address()==&Address::find_program_address(&[b"launch",&d[40..72]],p).0,110)?;Ok(d)
}
pub fn token_amount(a:&AccountView,m:&Address,owner:&Address,t:&Address)->Result<u64,ProgramError>{
    check(a.owned_by(t),111)?;let d=a.try_borrow()?;
    check(d.len()>=165&&&d[..32]==m.as_ref()&&&d[32..64]==owner.as_ref()&&d[108]==1,111)?;
    read64(&d,64)
}
pub fn ata(payer:&AccountView,target:&AccountView,owner:&AccountView,mint:&AccountView,sys:&AccountView,token:&AccountView)->ProgramResult{
    check(sys.address()==&SYSTEM&&(token.address()==&TOKEN||token.address()==&TOKEN2022),112)?;
    let expected=Address::find_program_address(&[owner.address().as_ref(),token.address().as_ref(),mint.address().as_ref()],&ATA).0;
    check(target.address()==&expected,112)?;
    invoke(&ATA,[payer,target,owner,mint,sys,token],[(true,true),(true,false),(false,false),(false,false),(false,false),(false,false)],&[1],&[])
}
pub fn transfer(from:&AccountView,m:&AccountView,to:&AccountView,owner:&AccountView,n:u64,t:&Address,signs:&[Signer])->ProgramResult{
    let dec={let b=m.try_borrow()?;check(b.len()>=82&&m.owned_by(t)&&b[45]==1,113)?;b[44]};
    let mut d=[0u8;10];d[0]=12;put64(&mut d,1,n);d[9]=dec;
    invoke(t,[from,m,to,owner],[(true,false),(false,false),(true,false),(false,true)],&d,signs)
}
pub fn quote_mint(m:&AccountView,t:&Address)->ProgramResult{
    check((*t==TOKEN||*t==TOKEN2022)&&m.owned_by(t),114)?;
    let d=m.try_borrow()?;check(d.len()>=82&&d[45]==1&&d[44]<=18,114)?;
    // DAMM checks the badge/allowlist. Active transfer hooks need extra accounts
    // that DAMM does not forward, so reject those even with a badge.
    if *t==TOKEN2022&&d.len()>82 {check(d.len()>=166&&d[165]==1,114)?;let mut i=166;
        while i+4<=d.len(){let kind=u16::from_le_bytes([d[i],d[i+1]]);let len=u16::from_le_bytes([d[i+2],d[i+3]])as usize;i+=4;check(i+len<=d.len(),114)?;
            if kind==14 {check(len==64&&d[i+32..i+64].iter().all(|x|*x==0),114)?;} i+=len;
        }
    } Ok(())
}
// Global config can only be initialized by this program's verified loader
// upgrade authority. No first-caller takeover; administration requires a signer.
// 0 admin, 1 config, 2 executable program, 3 programdata, 4 system.
#[inline(never)]
fn config(p:&Address,a:&mut[AccountView],d:&[u8])->ProgramResult{
    check(a.len()>=5&&a[0].is_signer()&&a[4].address()==&SYSTEM,120)?;
    let admin=*a[0].address();let token_program=if a.len()>5{*a[5].address()}else{TOKEN};
    let (cfg,b)=Address::find_program_address(&[b"config"],p);check(a[1].address()==&cfg,120)?;
    if d[0]==0 {check(d.len()==65,121)?;
        let jar_signer=address(d,33);let holder_signer=address(d,1);
        check(jar_signer!=SYSTEM&&jar_signer!=TREASURY&&jar_signer!=admin&&jar_signer!=holder_signer,121)?;
        if a[1].owned_by(&SYSTEM){
            check(a[2].address()==p&&a[2].owned_by(&LOADER)&&a[3].owned_by(&LOADER),121)?;
            {let x=a[2].try_borrow()?;let y=a[3].try_borrow()?;
            check(x.len()==36&&x[..4]==[2,0,0,0]&&&x[4..36]==a[3].address().as_ref(),121)?;
            check(y.len()>=45&&y[..4]==[3,0,0,0]&&y[12]==1&&&y[13..45]==a[0].address().as_ref(),121)?;}
            let bb=[b];let ss=[Seed::from(b"config"),Seed::from(&bb)];
            create_from_wallet(&a[1],104,p,&a[0],&[Signer::from(&ss)])?;
            let mut x=a[1].try_borrow_mut()?;x[..8].copy_from_slice(b"ETFCFG01");key(&mut x,8,&admin);
        }
        check(a[1].owned_by(p)&&a[1].data_len()==104,122)?;
        let mut x=a[1].try_borrow_mut()?;check(&x[..8]==b"ETFCFG01"&&&x[8..40]==admin.as_ref(),122)?;
        check(d[1..33].iter().any(|x|*x!=0),122)?;x[40..72].copy_from_slice(&d[1..33]);x[72..104].copy_from_slice(&d[33..65]);return Ok(());
    }
    // 1: quote config. 2 quote mint, 3 quote config, 4 system, 5 token program.
    check(d.len()==34&&a.len()==6&&a[1].owned_by(p)&&a[1].data_len()==104,123)?;
    {let x=a[1].try_borrow()?;check(&x[8..40]==a[0].address().as_ref(),123)?;}
    quote_mint(&a[2],a[5].address())?;
    let lo=u128at(d,2)?;let hi=u128at(d,18)?;check(d[1]<=1&&lo>=MIN_SQRT&&lo<hi&&hi<MAX_SQRT,123)?;
    let m=*a[2].address();let (qc,qb)=Address::find_program_address(&[b"quote",m.as_ref()],p);check(a[3].address()==&qc,123)?;
    if a[3].owned_by(&SYSTEM){let bb=[qb];let ss=[Seed::from(b"quote"),Seed::from(m.as_ref()),Seed::from(&bb)];create_from_wallet(&a[3],112,p,&a[0],&[Signer::from(&ss)])?;}
    check(a[3].owned_by(p)&&a[3].data_len()==112,123)?;let mut x=a[3].try_borrow_mut()?;
    x[..8].copy_from_slice(b"ETFQUO01");key(&mut x,8,&m);key(&mut x,40,&token_program);x[72..88].copy_from_slice(&lo.to_le_bytes());x[88..104].copy_from_slice(&hi.to_le_bytes());x[104]=d[1];Ok(())
}
