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
use pinocchio::{instruction::{InstructionView,InstructionAccount},sysvars::{instructions::Instructions,rent::Rent}};

const JAR_LEN:usize=128;
// Ed25519 native precompile; message offsets are checked against its single
// canonical self-contained layout, not arbitrary cross-instruction pointers.
const ED25519:Address=Address::new_from_array([3,125,70,214,124,147,251,190,18,249,66,143,131,141,64,255,5,112,116,73,39,244,138,100,252,202,112,68,128,0,0,0]);
const MESSAGE_LEN:usize=176;

// 8: launch, donor/payer signer, jar state, System, jar SOL PDA. Always SOL.
// 9: fixed accounts documented in checks/jar.py, then Jupiter conversion
// accounts. The final swap always calls the launch's registered DAMM pool.
#[inline(never)]
pub fn process(p:&Address,a:&mut[AccountView],d:&[u8])->ProgramResult {
    check(a.len()>=4,170)?;
    let s=state(p,&a[0])?;let launch=*a[0].address();
    let (jar,b)=Address::find_program_address(&[b"jar",launch.as_ref()],p);
    check(a[2].address()==&jar,170)?;
    let bb=[b];let seeds=[Seed::from(b"jar"),Seed::from(launch.as_ref()),Seed::from(&bb)];let signs=[Signer::from(&seeds)];
    if d[0]==8 {
        check(a.len()==5&&d.len()==9&&a[1].is_signer()&&a[3].address()==&SYSTEM,171)?;
        let n=read64(d,1)?;check(n>0,171)?;
        if a[2].owned_by(&SYSTEM) {create_from_wallet(&a[2],JAR_LEN,p,&a[1],&signs)?;
            let mut j=a[2].try_borrow_mut()?;j[..8].copy_from_slice(b"ETFJAR01");key(&mut j,8,&launch);j[80]=b;
        }
        let (pot,pb)=Address::find_program_address(&[b"jar-sol",launch.as_ref()],p);
        check(a[4].address()==&pot&&a[4].owned_by(&SYSTEM)&&a[4].is_data_empty(),171)?;
        let pbb=[pb];let ps=[Seed::from(b"jar-sol"),Seed::from(launch.as_ref()),Seed::from(&pbb)];
        if a[4].lamports()==0{create_from_wallet(&a[4],0,&SYSTEM,&a[1],&[Signer::from(&ps)])?;}
        let mut j=jar_state(p,&a[2],&launch)?;
        transfer_sol(&a[1],&a[4],n,&[])?;let total=add(read64(&j,48)?,n)?;put64(&mut j,48,total);
        a[2].try_borrow_mut()?.copy_from_slice(&j);return Ok(());
    }
    execute(p,a,d,&s,&signs)
}

fn jar_state(p:&Address,a:&AccountView,launch:&Address)->Result<[u8;JAR_LEN],ProgramError>{
    check(a.owned_by(p)&&a.data_len()==JAR_LEN,172)?;
    let j:[u8;JAR_LEN]=a.try_borrow()?.as_ref().try_into().map_err(|_|ProgramError::InvalidAccountData)?;
    check(&j[..8]==b"ETFJAR01"&&&j[8..40]==launch.as_ref(),172)?;Ok(j)
}

#[inline(never)]
fn authorize(p:&Address,a:&[AccountView],d:&[u8],s:&[u8;STATE_LEN],j:&[u8;JAR_LEN])->ProgramResult {
    // Payload: tag, amount, min launch tokens, expiry, nonce, min quote,
    // route-account count, per-account writable bits, Jupiter instruction data.
    let now=Clock::get()?.unix_timestamp;check(now>=0,173)?;
    let expires=read64(d,17)?;
    check(expires>=now as u64&&expires<=add(now as u64,60)?&&read64(d,25)?==read64(j,40)?
        &&read64(d,1)?>0&&read64(d,9)?>0&&now as u64>=add(read64(s,304)?,5)?,173)?;
    let mut message=[0u8;MESSAGE_LEN];message[..8].copy_from_slice(b"ETFJAR01");
    key(&mut message,8,p);key(&mut message,40,a[2].address());key(&mut message,72,a[0].address());
    message[104..144].copy_from_slice(&d[1..41]);
    let n=d[41]as usize;let route=route_hash(&a[24..],&d[42..42+n],&d[42+n..],a[2].address())?;
    message[144..176].copy_from_slice(&route);
    let sysvar=Instructions::try_from(&a[15])?;
    // Require a direct top-level call immediately after the native verification.
    check(sysvar.get_instruction_relative(0)?.get_program_id()==p,174)?;
    let ix=sysvar.get_instruction_relative(-1)?;
    check(ix.get_program_id()==&ED25519&&ix.num_account_metas()==0,174)?;
    let e=ix.get_instruction_data();
    // signature@16, key@80, message@112, all offsets use this instruction.
    let header=[1,0,16,0,255,255,80,0,255,255,112,0,MESSAGE_LEN as u8,0,255,255];
    check(e.len()==112+MESSAGE_LEN&&e[..16]==header&&e[80..112]==s[384..416]&&e[112..]==message,174)
}

#[inline(never)]
fn execute(p:&Address,a:&mut[AccountView],d:&[u8],s:&[u8;STATE_LEN],signs:&[Signer])->ProgramResult{
    check(a.len()>=24&&d.len()>=42,175)?;let count=d[41]as usize;
    check(count<=48&&a.len()==24+count&&d.len()>=42+count&&a[1].is_signer(),175)?;
    let q=address(s,72);let qt=address(s,104);let mint=address(s,40);let launch=*a[0].address();let jar=*a[2].address();
    for(i,k)in[(3,WSOL),(5,mint),(7,INCINERATOR),(9,q),(11,qt),(12,TOKEN),(13,ATA),(14,SYSTEM),(16,METEORA),(18,address(s,136))]{check(a[i].address()==&k,175)?;}
    check(a[17].address()==&Address::find_program_address(&[b"pool_authority"],&METEORA).0
        &&a[19].address()==&Address::find_program_address(&[b"token_vault",mint.as_ref(),a[18].address().as_ref()],&METEORA).0
        &&a[20].address()==&Address::find_program_address(&[b"token_vault",q.as_ref(),a[18].address().as_ref()],&METEORA).0
        &&a[21].address()==&Address::find_program_address(&[b"__event_authority"],&METEORA).0,175)?;
    let mut j=jar_state(p,&a[2],&launch)?;authorize(p,a,d,s,&j)?;
    if q==WSOL {check(count==0&&d.len()==42&&a[10].address()==a[4].address()&&read64(d,33)?==0,175)?;}
    else {check(count>0&&d.len()>42+count&&a[22].address()==&JUPITER&&read64(d,33)?>0,175)?;}
    for(target,owner,m,t)in[(4,2,3,12),(6,2,5,12),(8,7,5,12),(10,2,9,11)]{
        ata(&a[1],&a[target],&a[owner],&a[m],&a[14],&a[t])?;
    }
    let before=token_amount(&a[6],&mint,&jar,&TOKEN)?;
    let sol_before=token_amount(&a[4],&WSOL,&jar,&TOKEN)?;
    let q_before=token_amount(&a[10],&q,&jar,&qt)?;
    let n=read64(d,1)?;let rent=Rent::get()?.try_minimum_balance(0)?;
    let (pot,pb)=Address::find_program_address(&[b"jar-sol",launch.as_ref()],p);
    check(a[23].address()==&pot&&a[23].owned_by(&SYSTEM)&&a[23].is_data_empty(),176)?;
    check(a[23].lamports().saturating_sub(rent)>=n,176)?;
    let pbb=[pb];let pot_seeds=[Seed::from(b"jar-sol"),Seed::from(launch.as_ref()),Seed::from(&pbb)];
    // The SOL fund PDA is never forwarded to Jupiter; only this exact native
    // transfer to the jar's validated WSOL ATA can use its signer seeds.
    transfer_sol(&a[23],&a[4],n,&[Signer::from(&pot_seeds)])?;
    invoke(&TOKEN,[&a[4]],[(true,false)],&[17],&[])?;
    let quote_in=if q==WSOL {n}else{
        // Restrict the temporary signer to this jar's source/destination ATAs.
        // The jar SOL account is always read-only in Jupiter, so conversion
        // cannot spend rent, future donations or the jar's remaining budget.
        for (i,v) in a[24..].iter().enumerate(){
            check(d[42+i]<=1,177)?;
            if v.address()==&jar {check(d[42+i]==0,177)?;}
            for protected in [0usize,1,6,8,18,19,20,23]{check(v.address()!=a[protected].address(),177)?;}
            if v.owned_by(&TOKEN)||v.owned_by(&TOKEN2022){let x=v.try_borrow()?;
                if x.len()>=165&&&x[32..64]==jar.as_ref(){check(v.address()==a[4].address()||v.address()==a[10].address(),177)?;}
            }
        }
        convert(&a[24..],&d[42..42+count],&d[42+count..],&jar,signs)?;
        check(token_amount(&a[4],&WSOL,&jar,&TOKEN)?==sol_before,178)?;
        let gained=sub(token_amount(&a[10],&q,&jar,&qt)?,q_before)?;check(gained>=read64(d,33)?,178)?;gained
    };
    let mut swap=[0u8;25];swap[..8].copy_from_slice(&[65,75,63,76,235,91,91,136]);put64(&mut swap,8,quote_in);put64(&mut swap,16,read64(d,9)?);
    // The only launched-token purchase is this exact official DAMM pool.
    invoke(&METEORA,[&a[17],&a[18],&a[10],&a[6],&a[19],&a[20],&a[5],&a[9],&a[2],&a[12],&a[11],&a[16],&a[21],&a[16]],
        [(false,false),(true,false),(true,false),(true,false),(true,false),(true,false),(false,false),(false,false),(false,true),(false,false),(false,false),(false,false),(false,false),(false,false)],&swap,signs)?;
    let received=sub(token_amount(&a[6],&mint,&jar,&TOKEN)?,before)?;
    check(received>=read64(d,9)?&&token_amount(&a[4],&WSOL,&jar,&TOKEN)?==sol_before,178)?;
    if q!=WSOL {check(token_amount(&a[10],&q,&jar,&qt)?==q_before,178)?;}
    transfer(&a[6],&a[5],&a[8],&a[2],received,&TOKEN,signs)?;
    let nonce=add(read64(&j,40)?,1)?;let spent=add(read64(&j,56)?,n)?;let burned=add(read64(&j,64)?,received)?;
    put64(&mut j,40,nonce);put64(&mut j,56,spent);put64(&mut j,64,burned);put64(&mut j,72,Clock::get()?.slot);
    a[2].try_borrow_mut()?.copy_from_slice(&j);
    let all=add(read64(s,368)?,received)?;put64(&mut a[0].try_borrow_mut()?,368,all);Ok(())
}

#[inline(never)]
fn route_hash(a:&[AccountView],flags:&[u8],data:&[u8],jar:&Address)->Result<[u8;32],ProgramError>{
    check(a.len()==flags.len(),179)?;let mut h=hash(data);let mut buf=[0u8;66];
    for(i,v)in a.iter().enumerate(){check(flags[i]<=1,179)?;buf[..32].copy_from_slice(&h);buf[32..64].copy_from_slice(v.address().as_ref());buf[64]=flags[i];buf[65]=(v.address()==jar)as u8;h=hash(&buf);}Ok(h)
}
#[inline(never)]
fn convert(a:&[AccountView],flags:&[u8],data:&[u8],jar:&Address,signs:&[Signer])->ProgramResult{
    let metas:[InstructionAccount;48]=core::array::from_fn(|i|if i<a.len(){InstructionAccount::new(a[i].address(),flags[i]==1,a[i].address()==jar)}else{InstructionAccount::readonly(&SYSTEM)});
    dynamic_invoke(&InstructionView{program_id:&JUPITER,accounts:&metas[..a.len()],data},a,signs)
}
#[inline(never)]
fn dynamic_invoke(ix:&InstructionView,a:&[AccountView],signs:&[Signer])->ProgramResult{
    pinocchio::cpi::invoke_signed_with_bounds::<48,_>(ix,a,signs)
}
