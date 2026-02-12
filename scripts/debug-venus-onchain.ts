/**
 * Debug script to query Venus vToken contracts directly
 * and understand the APY calculation
 */

import 'dotenv/config';
import { createPublicClient, http, formatUnits } from 'viem';
import { bsc } from 'viem/chains';

const BNB_RPC_URL = process.env.BNB_RPC_URL || 'https://1rpc.io/bnb';

// vBNB contract address (Core Venus market)
const VBNB = '0xA07c5b74C9B40447a954e1466938b865b6BBea36' as const;
const VUSDT = '0xfD5840Cd36d94D7229439859C0112a4185BC0255' as const;
const VUSDC = '0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8' as const;

// Full vToken ABI for all readable functions
const VTOKEN_ABI = [
  // Supply rate per block
  {
    name: 'supplyRatePerBlock',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // Borrow rate per block
  {
    name: 'borrowRatePerBlock',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // Total supply of vTokens
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // Total borrows
  {
    name: 'totalBorrows',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // Cash (available liquidity)
  {
    name: 'getCash',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // Exchange rate
  {
    name: 'exchangeRateStored',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // Reserve factor
  {
    name: 'reserveFactorMantissa',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // Symbol
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
] as const;

const client = createPublicClient({
  chain: bsc,
  transport: http(BNB_RPC_URL),
});

// BSC block time is ~3 seconds
const BLOCKS_PER_DAY = 28800; // 86400 / 3
const DAYS_PER_YEAR = 365;
const BLOCKS_PER_YEAR = BLOCKS_PER_DAY * DAYS_PER_YEAR;

async function queryVToken(address: `0x${string}`, name: string) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 Querying ${name} (${address})`);
  console.log('='.repeat(50));

  try {
    const [
      symbol,
      supplyRatePerBlock,
      borrowRatePerBlock,
      totalSupply,
      totalBorrows,
      cash,
      exchangeRate,
      reserveFactor,
    ] = await Promise.all([
      client.readContract({ address, abi: VTOKEN_ABI, functionName: 'symbol' }),
      client.readContract({ address, abi: VTOKEN_ABI, functionName: 'supplyRatePerBlock' }),
      client.readContract({ address, abi: VTOKEN_ABI, functionName: 'borrowRatePerBlock' }),
      client.readContract({ address, abi: VTOKEN_ABI, functionName: 'totalSupply' }),
      client.readContract({ address, abi: VTOKEN_ABI, functionName: 'totalBorrows' }),
      client.readContract({ address, abi: VTOKEN_ABI, functionName: 'getCash' }),
      client.readContract({ address, abi: VTOKEN_ABI, functionName: 'exchangeRateStored' }),
      client.readContract({ address, abi: VTOKEN_ABI, functionName: 'reserveFactorMantissa' }),
    ]);

    console.log(`\nSymbol: ${symbol}`);

    console.log('\n📈 Raw Contract Values:');
    console.log(`   supplyRatePerBlock: ${supplyRatePerBlock.toString()}`);
    console.log(`   borrowRatePerBlock: ${borrowRatePerBlock.toString()}`);
    console.log(`   totalSupply (vTokens): ${totalSupply.toString()}`);
    console.log(`   totalBorrows: ${totalBorrows.toString()}`);
    console.log(`   cash (liquidity): ${cash.toString()}`);
    console.log(`   exchangeRate: ${exchangeRate.toString()}`);
    console.log(`   reserveFactor: ${reserveFactor.toString()}`);

    // Calculate APY using Venus formula
    // supplyRatePerBlock is already scaled by 1e18
    const supplyRatePerBlockNum = Number(supplyRatePerBlock);
    const borrowRatePerBlockNum = Number(borrowRatePerBlock);

    // Method 1: Simple APR (rate * blocks per year)
    const supplyAPR = (supplyRatePerBlockNum / 1e18) * BLOCKS_PER_YEAR * 100;
    const borrowAPR = (borrowRatePerBlockNum / 1e18) * BLOCKS_PER_YEAR * 100;

    // Method 2: Compound APY (daily compounding)
    const supplyAPY_daily = (Math.pow(1 + (supplyRatePerBlockNum / 1e18) * BLOCKS_PER_DAY, DAYS_PER_YEAR) - 1) * 100;
    const borrowAPY_daily = (Math.pow(1 + (borrowRatePerBlockNum / 1e18) * BLOCKS_PER_DAY, DAYS_PER_YEAR) - 1) * 100;

    // Method 3: Per-block compounding (theoretical max)
    const supplyAPY_block = (Math.pow(1 + supplyRatePerBlockNum / 1e18, BLOCKS_PER_YEAR) - 1) * 100;

    console.log('\n💰 APY Calculations:');
    console.log(`   Supply APR (simple):        ${supplyAPR.toFixed(4)}%`);
    console.log(`   Supply APY (daily compound): ${supplyAPY_daily.toFixed(4)}%`);
    console.log(`   Supply APY (block compound): ${supplyAPY_block.toFixed(4)}%`);
    console.log(`   Borrow APR (simple):         ${borrowAPR.toFixed(4)}%`);
    console.log(`   Borrow APY (daily compound): ${borrowAPY_daily.toFixed(4)}%`);

    // Calculate utilization rate
    const totalAssets = Number(cash) + Number(totalBorrows);
    const utilizationRate = totalAssets > 0 ? (Number(totalBorrows) / totalAssets) * 100 : 0;

    // Calculate TVL in underlying
    const exchangeRateNum = Number(formatUnits(exchangeRate, 18));
    const totalSupplyUnderlying = Number(formatUnits(totalSupply, 8)) * exchangeRateNum;

    console.log('\n📊 Market Stats:');
    console.log(`   Utilization Rate: ${utilizationRate.toFixed(2)}%`);
    console.log(`   Total Supply (underlying): ${totalSupplyUnderlying.toFixed(4)}`);
    console.log(`   Reserve Factor: ${Number(formatUnits(reserveFactor, 18)) * 100}%`);

    return {
      symbol,
      supplyAPR,
      supplyAPY: supplyAPY_daily,
      borrowAPR,
      borrowAPY: borrowAPY_daily,
      utilizationRate,
      totalSupplyUnderlying,
    };
  } catch (error) {
    console.error(`Error querying ${name}:`, error);
    return null;
  }
}

async function main() {
  console.log('🔍 Venus Protocol On-Chain Data Query');
  console.log('=====================================\n');
  console.log(`RPC: ${BNB_RPC_URL}`);
  console.log(`Blocks per day: ${BLOCKS_PER_DAY}`);
  console.log(`Blocks per year: ${BLOCKS_PER_YEAR}`);

  const results = await Promise.all([
    queryVToken(VBNB, 'vBNB'),
    queryVToken(VUSDT, 'vUSDT'),
    queryVToken(VUSDC, 'vUSDC'),
  ]);

  console.log('\n\n📋 SUMMARY');
  console.log('='.repeat(50));
  console.log('Token      | Supply APY | Borrow APY | Utilization');
  console.log('-'.repeat(50));

  for (const r of results) {
    if (r) {
      console.log(
        `${r.symbol.padEnd(10)} | ${r.supplyAPY.toFixed(2).padStart(9)}% | ${r.borrowAPY.toFixed(2).padStart(9)}% | ${r.utilizationRate.toFixed(2).padStart(10)}%`
      );
    }
  }

  console.log('\n✅ Note: These are BASE APYs only (no XVS rewards included)');
  console.log('   Venus UI shows higher APYs because it includes XVS distribution rewards.');
}

main().catch(console.error);
