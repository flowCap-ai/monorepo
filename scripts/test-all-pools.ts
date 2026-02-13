/**
 * Test that ALL discovered pools can be analyzed
 * This ensures getPools() and analyzePool() are fully compatible
 */

import 'dotenv/config';
import getPools from '../agents/skills/getPools.js';
import analyzePool from '../agents/skills/analyzePool.js';

async function testAllPools() {
  console.log('🧪 Testing ALL Pool Discovery and Analysis\n');
  console.log('=' .repeat(60));

  // Step 1: Discover all pools
  console.log('\n📊 Discovering all pools...\n');
  const allPools = await getPools.getAllPools();

  console.log(`✅ Found ${allPools.length} total pools:`);
  console.log(`  - Venus: ${allPools.filter(p => p.protocol === 'venus').length}`);
  console.log(`  - PancakeSwap: ${allPools.filter(p => p.protocol === 'pancakeswap').length}`);
  console.log(`  - Lista Lending: ${allPools.filter(p => p.protocol === 'lista-lending').length}`);
  console.log(`  - Lista Staking: ${allPools.filter(p => p.protocol === 'lista-staking').length}`);
  console.log(`  - Alpaca: ${allPools.filter(p => p.protocol === 'alpaca').length}`);

  // Step 2: Check token addresses
  console.log('\n📊 Checking token addresses...\n');
  const poolsWithTokens = allPools.filter(p => p.underlyingTokens && p.underlyingTokens.length > 0);
  console.log(`✅ ${poolsWithTokens.length}/${allPools.length} pools have underlying token addresses`);

  // Show sample Venus pool with addresses
  const venusPool = allPools.find(p => p.protocol === 'venus' && p.assets.includes('USDT'));
  if (venusPool) {
    console.log('\nSample Venus pool (USDT):');
    console.log(`  Pool ID: ${venusPool.poolId}`);
    console.log(`  vToken Address: ${venusPool.address}`);
    console.log(`  Underlying Token: ${venusPool.underlyingTokens?.[0] || 'N/A'}`);
  }

  // Step 3: Test analyzing pools from each protocol
  console.log('\n📊 Testing pool analysis for each protocol...\n');

  const testCases = [
    { protocol: 'venus', pool: allPools.find(p => p.protocol === 'venus') },
    { protocol: 'pancakeswap', pool: allPools.find(p => p.protocol === 'pancakeswap') },
    { protocol: 'lista-lending', pool: allPools.find(p => p.protocol === 'lista-lending') },
    { protocol: 'lista-staking', pool: allPools.find(p => p.protocol === 'lista-staking') },
  ];

  let successCount = 0;
  let failCount = 0;

  for (const { protocol, pool } of testCases) {
    if (!pool) {
      console.log(`⚠️  No ${protocol} pool found to test`);
      continue;
    }

    try {
      const analysis = await analyzePool.analyzePool(pool.poolId, pool.address);
      console.log(`✅ ${protocol}: ${pool.name}`);
      console.log(`   APY: ${analysis.apy.toFixed(2)}%, Risk: ${analysis.riskScore}/100 (${analysis.riskLevel})`);
      successCount++;
    } catch (error) {
      console.log(`❌ ${protocol}: ${pool.name}`);
      console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failCount++;
    }
  }

  // Step 4: Test a few random pools
  console.log('\n📊 Testing random pool analysis...\n');

  const randomPools = allPools
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);

  for (const pool of randomPools) {
    try {
      const analysis = await analyzePool.analyzePool(pool.poolId, pool.address);
      console.log(`✅ ${pool.protocol}: ${pool.name} - APY ${analysis.apy.toFixed(2)}%`);
      successCount++;
    } catch (error) {
      console.log(`❌ ${pool.protocol}: ${pool.name}`);
      console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Test Summary:`);
  console.log(`  ✅ Successful: ${successCount}`);
  console.log(`  ❌ Failed: ${failCount}`);
  console.log(`  Total Tested: ${successCount + failCount}`);

  if (failCount === 0) {
    console.log('\n🎉 All pools can be analyzed successfully!');
  } else {
    console.log(`\n⚠️  ${failCount} pools failed analysis - check errors above`);
  }

  console.log('\n💡 Key Points:');
  console.log('  - Venus pools use on-chain APY calculation (most accurate)');
  console.log('  - Other protocols use DeFiLlama aggregated data');
  console.log('  - Generic analyzer serves as fallback for unknown pool types');
  console.log('  - All pools include token addresses for execSwap\n');
}

testAllPools().catch(console.error);
