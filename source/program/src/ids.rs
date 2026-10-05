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
use pinocchio::Address;
// 11111111111111111111111111111111
pub const SYSTEM:Address=Address::new_from_array([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
// TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
pub const TOKEN:Address=Address::new_from_array([6,221,246,225,215,101,161,147,217,203,225,70,206,235,121,172,28,180,133,237,95,91,55,145,58,140,245,133,126,255,0,169]);
// TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
pub const TOKEN2022:Address=Address::new_from_array([6,221,246,225,238,117,143,222,24,66,93,188,228,108,205,218,182,26,252,77,131,185,13,39,254,189,249,40,216,161,139,252]);
// So11111111111111111111111111111111111111112
pub const WSOL:Address=Address::new_from_array([6,155,136,87,254,171,129,132,251,104,127,99,70,24,192,53,218,196,57,220,26,235,59,85,152,160,240,0,0,0,0,1]);
// ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
pub const ATA:Address=Address::new_from_array([140,151,37,143,78,36,137,241,187,61,16,41,20,142,13,131,11,90,19,153,218,255,16,132,4,142,123,216,219,233,248,89]);
// metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s
pub const METADATA:Address=Address::new_from_array([11,112,101,177,227,209,124,69,56,157,82,127,107,4,195,205,88,184,108,115,26,160,253,181,73,182,209,188,3,248,41,70]);
// cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG
pub const METEORA:Address=Address::new_from_array([9,45,33,53,101,122,21,156,43,135,212,182,106,112,219,142,151,82,56,159,247,106,175,32,108,237,6,58,56,249,90,237]);
// Aew8XrvYLkm8B22iRsxbKxZ1rEaT7maYn3tNJNTTN7ft
pub const TREASURY:Address=Address::new_from_array([143,112,224,137,239,35,12,85,191,140,71,71,122,108,253,188,58,145,213,8,129,161,108,69,87,36,109,188,151,227,187,143]);
// 1nc1nerator11111111111111111111111111111111
pub const INCINERATOR:Address=Address::new_from_array([0,51,144,114,141,52,17,96,121,189,201,17,191,255,0,219,212,77,46,205,204,247,156,166,225,0,56,225,0,0,0,0]);
// BPFLoaderUpgradeab1e11111111111111111111111
pub const LOADER:Address=Address::new_from_array([2,168,246,145,78,136,161,176,226,16,21,62,247,99,174,43,0,194,185,61,22,193,36,210,192,83,122,16,4,128,0,0]);
// Jupiter v6, official jup-ag/sol-swap-cpi integration.
pub const JUPITER:Address=Address::new_from_array([4, 121, 213, 91, 242, 49, 192, 110, 238, 116, 197, 110, 206, 104, 21, 7, 253, 177, 178, 222, 163, 244, 142, 81, 2, 177, 205, 162, 86, 188, 19, 143]);
