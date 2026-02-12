/**
 * Debug script to verify APY calculation
 * Venus APY = Base APY + XVS Rewards APY
 */

import 'dotenv/config';
import { createPublicClient, http, formatUnits } from 'viem';
import { bsc } from 'viem/chains';

const BNB_RPC_URL = process.env.BNB_RPC_URL || 'https://1rpc.io/bnb';

const VTOKEN_ABI = [
  {
    name: 'supplyRatePerBlock',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'exchangeRateStored',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const COMPTROLLER_ABI = [
  {
    name: 'venusSupplySpeeds',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'vToken', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const client = createPublicClient({
  chain: bsc,
  transport: http(BNB_RPC_URL),
});

// Venus addresses
const VBNB = '0xA07c5b74C9B40447a954e1466938b865b6BBea36' as const;
const COMPTROLLER = '0xfD36E2c2a6789Db23113685031d7F16329158384' as const;

async function main() {
  console.log('🔍 Debugging Venus APY Calculation (with XVS rewards)\n');

  // Get base supply rate
  const [supplyRatePerBlock, totalSupply, exchangeRate] = await Promise.all([
    client.readContract({
      address: VBNB,
      abi: VTOKEN_ABI,
      functionName: 'supplyRatePerBlock',
    }),
    client.readContract({
      address: VBNB,
      abi: VTOKEN_ABI,
      functionName: 'totalSupply',
    }),
    client.readContract({
      address: VBNB,
      abi: VTOKEN_ABI,
      functionName: 'exchangeRateStored',
    }),
  ]);

  // Get XVS supply speed
  let venusSupplySpeed: bigint;
  try {
    venusSupplySpeed = await client.readContract({
      address: COMPTROLLER,
      abi: COMPTROLLER_ABI,
      functionName: 'venusSupplySpeeds',
      args: [VBNB],
    });
  } catch (e) {
    venusSupplySpeed = BigInt(0);
    console.log('⚠️  Could not fetch venusSupplySpeeds (may need different ABI)');
  }

  console.log('Raw values:');
  console.log('  supplyRatePerBlock:', supplyRatePerBlock.toString());
  console.log('  totalSupply (vBNB):', totalSupply.toString());
  console.log('  exchangeRate:', exchangeRate.toString());
  console.log('  venusSupplySpeed:', venusSupplySpeed.toString());

  // Calculate base APY
  const BLOCKS_PER_DAY = 28800;
  const DAYS_PER_YEAR = 365;

  const ratePerBlock = Number(formatUnits(supplyRatePerBlock, 18));
  const baseAPY = ratePerBlock * BLOCKS_PER_DAY * DAYS_PER_YEAR * 100;

  console.log('\n📊 Base Supply APY:', baseAPY.toFixed(4) + '%');

  // Calculate total supply in underlying (BNB)
  // totalSupplyUnderlying = totalSupply * exchangeRate / 1e18
  const totalSupplyUnderlying = Number(formatUnits(totalSupply, 8)) * Number(formatUnits(exchangeRate, 18));
  console.log('   Total Supply (BNB):', totalSupplyUnderlying.toFixed(2));

  // XVS rewards calculation would need:
  // - venusSupplySpeed (XVS per block distributed to suppliers)
  // - XVS price in USD
  // - Total supply in USD

  console.log('\n💡 The difference between on-chain (0.03%) and UI (0.21%) is likely:');
  console.log('   1. XVS reward APY (distributed to suppliers)');
  console.log('   2. Or Venus uses a different calculation method');

  // Let's also try fetching from Venus API
  console.log('\n🌐 Fetching from Venus API...');
  try {
    const response = await fetch('https://api.venus.io/api/governance/venus');
    const data = await response.json() as any;
    const vBNBData = data.data?.markets?.find((m: any) => m.symbol === 'vBNB');
    if (vBNBData) {
      console.log('   Venus API vBNB:');
      console.log('     Supply APY:', vBNBData.supplyApy);
      console.log('     Supply Venus APY:', vBNBData.supplyVenusApy);
      console.log('     Total Supply:', vBNBData.totalSupplyUsd);
    }
  } catch (e) {
    console.log('   Could not fetch Venus API');
  }

  // Try DeFiLlama
  console.log('\n🦙 Fetching from DeFiLlama...');
  try {
    const response = await fetch('https://yields.llama.fi/pools');
    const data = await response.json() as any;
    const venusBNB = data.data?.find((p: any) =>
      p.project === 'venus' && p.symbol?.includes('BNB') && p.chain === 'BSC'
    );
    if (venusBNB) {
      console.log('   DeFiLlama Venus BNB:');
      console.log('     APY:', venusBNB.apy?.toFixed(4) + '%');
      console.log('     APY Base:', venusBNB.apyBase?.toFixed(4) + '%');
      console.log('     APY Reward:', venusBNB.apyReward?.toFixed(4) + '%');
      console.log('     TVL:', '$' + (venusBNB.tvlUsd / 1e6).toFixed(2) + 'M');
    }
  } catch (e) {
    console.log('   Could not fetch DeFiLlama');
  }
}

main().catch(console.error);
