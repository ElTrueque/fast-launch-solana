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
use pinocchio::{AccountView, Address, ProgramResult, error::ProgramError,
    instruction::{InstructionView, InstructionAccount}, cpi::{invoke_signed, Signer},
    sysvars::{Sysvar, rent::Rent}};
use crate::ids::*;
pub fn check(ok:bool,code:u32)->ProgramResult {if ok {Ok(())}else{Err(ProgramError::Custom(code))}}
pub fn read64(d:&[u8],i:usize)->Result<u64,ProgramError>{
    Ok(u64::from_le_bytes(d.get(i..i+8).ok_or(ProgramError::InvalidAccountData)?.try_into().map_err(|_|ProgramError::InvalidAccountData)?))
}
pub fn put64(d:&mut[u8],i:usize,v:u64){d[i..i+8].copy_from_slice(&v.to_le_bytes());}
pub fn address(d:&[u8],i:usize)->Address { Address::new_from_array(d[i..i+32].try_into().unwrap()) }
pub fn add(a:u64,b:u64)->Result<u64,ProgramError>{a.checked_add(b).ok_or(ProgramError::ArithmeticOverflow)}
pub fn sub(a:u64,b:u64)->Result<u64,ProgramError>{a.checked_sub(b).ok_or(ProgramError::InsufficientFunds)}
#[inline(never)]
pub fn invoke<const N:usize>(program:&Address,a:[&AccountView;N],flags:[(bool,bool);N],data:&[u8],signs:&[Signer])->ProgramResult{
    let metas:[InstructionAccount;N]=core::array::from_fn(|i|InstructionAccount::new(a[i].address(),flags[i].0,flags[i].1));
    invoke_signed(&InstructionView{program_id:program,accounts:&metas,data},&a,signs)
}
pub fn transfer_sol(from:&AccountView,to:&AccountView,n:u64,signs:&[Signer])->ProgramResult{
    let mut data=[0u8;12];data[..4].copy_from_slice(&2u32.to_le_bytes());data[4..].copy_from_slice(&n.to_le_bytes());
    invoke(&SYSTEM,[from,to],[(true,true),(true,false)],&data,signs)
}
pub fn allocate(account:&AccountView,len:usize,owner:&Address,funder:&AccountView,signs:&[Signer])->ProgramResult{
    check(account.owned_by(&SYSTEM)&&account.is_data_empty(),102)?;
    let mut data=[0u8;12];data[..4].copy_from_slice(&8u32.to_le_bytes());data[4..].copy_from_slice(&(len as u64).to_le_bytes());
    invoke(&SYSTEM,[account,funder],[(true,true),(true,false)],&data,signs)?;
    let mut data=[0u8;36];data[..4].copy_from_slice(&1u32.to_le_bytes());data[4..].copy_from_slice(owner.as_ref());
    invoke(&SYSTEM,[account,funder],[(true,true),(true,false)],&data,signs)
}
pub fn create_from_wallet(account:&AccountView,len:usize,owner:&Address,payer:&AccountView,signs:&[Signer])->ProgramResult{
    check(account.owned_by(&SYSTEM)&&account.is_data_empty(),102)?;
    if account.lamports()==0{
        let mut data=[0u8;52];
        data[4..12].copy_from_slice(&Rent::get()?.try_minimum_balance(len)?.to_le_bytes());
        data[12..20].copy_from_slice(&(len as u64).to_le_bytes());data[20..].copy_from_slice(owner.as_ref());
        return invoke(&SYSTEM,[payer,account],[(true,true),(true,true)],&data,signs);
    }
    let need=Rent::get()?.try_minimum_balance(len)?.saturating_sub(account.lamports());
    if need>0 {transfer_sol(payer,account,need,signs)?;}
    allocate(account,len,owner,payer,signs)
}
pub fn initialize_token(vault:&AccountView,mint:&AccountView,owner:&Address)->ProgramResult{
    let mut data=[0u8;33];data[0]=18;data[1..].copy_from_slice(owner.as_ref());
    invoke(&TOKEN,[vault,mint],[(true,false),(false,false)],&data,&[])
}
