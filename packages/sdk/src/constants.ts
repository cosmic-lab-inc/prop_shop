import { Keypair, PublicKey } from "@solana/web3.js";

export const DRIFT_VAULTS_PROGRAM_ID = new PublicKey(
  "vAuLTsyrvSfZRuRB3XgvkPwNGgYSs9YRYymVebLKoxR",
);

export const PYTH_PROGRAM_ID = new PublicKey(
  "FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH",
);

export const DRIFT_PROGRAM_ID = new PublicKey(
  "dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH",
);

export const PROP_SHOP_PROTOCOL = new PublicKey(
  "CSMCi5Z6pBjMXQFQayk4WgVPNAgjmo1jTNEryjYyk4xN",
);
export const PROP_SHOP_PERCENT_PROFIT_SHARE = 5;
export const PROP_SHOP_PERCENT_ANNUAL_FEE = 0.5;

export const ONE_HOUR = 60 * 60;
export const ONE_DAY = 24 * ONE_HOUR;

export const TEST_MANAGER = Keypair.fromSecretKey(
  Uint8Array.from([
    227, 185, 144, 50, 130, 96, 115, 109, 90, 243, 138, 244, 255, 246, 141, 166,
    88, 247, 171, 22, 83, 229, 104, 216, 70, 92, 240, 181, 105, 72, 15, 64, 213,
    210, 95, 158, 178, 133, 185, 44, 18, 247, 244, 72, 76, 99, 37, 122, 244,
    176, 217, 16, 236, 246, 251, 89, 246, 167, 214, 51, 4, 82, 135, 77,
  ]),
);

export const TEST_VAULT_DEPOSITOR = Keypair.fromSecretKey(
  Uint8Array.from([
    33, 43, 111, 192, 163, 89, 226, 144, 13, 171, 190, 88, 18, 119, 190, 150,
    126, 239, 248, 27, 5, 149, 109, 58, 210, 66, 40, 254, 142, 192, 31, 216,
    208, 153, 240, 87, 38, 71, 69, 79, 196, 155, 114, 58, 36, 156, 220, 104, 87,
    63, 32, 135, 139, 175, 155, 149, 50, 185, 149, 80, 57, 7, 195, 231,
  ]),
);
