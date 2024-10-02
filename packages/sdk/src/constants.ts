import { Keypair, PublicKey } from '@solana/web3.js';

export const DRIFT_VAULTS_PROGRAM_ID = new PublicKey(
	'vAuLTsyrvSfZRuRB3XgvkPwNGgYSs9YRYymVebLKoxR'
);

export const PHOENIX_VAULTS_PROGRAM_ID = new PublicKey(
	'VLt8tiD4iUGVuxFRr1NiN63BYJGKua5rNpEcsEGzdBq'
);

export const PYTH_PROGRAM_ID = new PublicKey(
	'FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH'
);

export const DRIFT_PROGRAM_ID = new PublicKey(
	'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH'
);

export const PROP_SHOP_PROTOCOL = new PublicKey(
	'CSMCi5Z6pBjMXQFQayk4WgVPNAgjmo1jTNEryjYyk4xN'
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
	])
);

export const TEST_DRIFT_INVESTOR = Keypair.fromSecretKey(
	Uint8Array.from([
		33, 43, 111, 192, 163, 89, 226, 144, 13, 171, 190, 88, 18, 119, 190, 150,
		126, 239, 248, 27, 5, 149, 109, 58, 210, 66, 40, 254, 142, 192, 31, 216,
		208, 153, 240, 87, 38, 71, 69, 79, 196, 155, 114, 58, 36, 156, 220, 104, 87,
		63, 32, 135, 139, 175, 155, 149, 50, 185, 149, 80, 57, 7, 195, 231,
	])
);

export const TEST_PHOENIX_INVESTOR = Keypair.fromSecretKey(
	Uint8Array.from([
		90, 148, 254, 33, 159, 111, 163, 255, 226, 122, 191, 4, 165, 21, 240, 162,
		59, 33, 231, 219, 226, 12, 92, 59, 134, 212, 34, 30, 244, 19, 138, 57, 11,
		99, 62, 102, 76, 189, 184, 235, 91, 200, 116, 146, 128, 253, 100, 203, 34,
		86, 151, 28, 74, 252, 77, 113, 121, 202, 132, 33, 180, 101, 239, 228,
	])
);

export const TEST_USDC_MINT = Keypair.fromSecretKey(
	Uint8Array.from([
		87, 198, 89, 198, 67, 63, 51, 219, 219, 205, 135, 80, 234, 56, 140, 16, 89,
		50, 81, 229, 158, 31, 99, 65, 96, 2, 245, 44, 73, 148, 172, 223, 207, 221,
		139, 122, 3, 190, 18, 238, 58, 168, 238, 122, 70, 81, 217, 218, 189, 29,
		109, 94, 252, 95, 110, 157, 33, 107, 20, 14, 201, 83, 184, 122,
	])
);

export const TEST_USDC_MINT_AUTHORITY = Keypair.fromSecretKey(
	Uint8Array.from([
		66, 123, 76, 224, 250, 46, 45, 185, 92, 44, 26, 59, 177, 162, 57, 152, 152,
		168, 214, 27, 185, 110, 97, 62, 226, 94, 214, 190, 206, 253, 83, 234, 143,
		207, 63, 171, 250, 160, 85, 171, 204, 57, 11, 146, 117, 118, 22, 155, 104,
		251, 84, 131, 255, 168, 226, 187, 237, 120, 54, 43, 103, 65, 121, 161,
	])
);

export const DRIFT_API_PREFIX =
	'https://drift-historical-data-v2.s3.eu-west-1.amazonaws.com/program/dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH/';
