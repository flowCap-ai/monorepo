/**
 * Test the new dynamic pool discovery and analysis flow
 */

import 'dotenv/config';
import getPools from '../agents/skills/getPools.js';
import analyzePool from '../agents/skills/analyzePool.js';

async function testNewFlow() {
  console.log('🚀 FlowCap Dynamic Pool Analysis Flow\n');
  console.log('=' .repeat(60));

  // Step 1: Discover all available pools
  console.log('\n📊 STEP 1: Discovering available pools...\n');

  const allPools = await getPools.getAllPools();
  console.log(`Found ${allPools.length} total pools:`);
  console.log(`  - Venus: ${allPools.filter(p => p.protocol === 'venus').length} lending markets`);
  console.log(`  - PancakeSwap: ${allPools.filter(p => p.protocol === 'pancakeswap').length} LP farms`);
  console.log(`  - Lista Lending: ${allPools.filter(p => p.protocol === 'lista-lending').length} lending markets`);
  console.log(`  - Lista Staking: ${allPools.filter(p => p.protocol === 'lista-staking').length} liquid staking pools`);
  console.log(`  - Alpaca Finance: ${allPools.filter(p => p.protocol === 'alpaca').length} leveraged farms`);

  // Step 2: Filter by risk profile
  console.log('\n📊 STEP 2: Filtering by risk profile (LOW)...\n');

  const lowRiskPools = getPools.filterPoolsByRisk(allPools, 'low');
  console.log(`Found ${lowRiskPools.length} low-risk pools:`);
  for (const pool of lowRiskPools.slice(0, 5)) {
    console.log(`  - ${pool.name} (${pool.protocol})`);
  }

  // Step 3: Analyze specific pools
  console.log('\n📊 STEP 3: Analyzing specific pools...\n');

  // Analyze Venus USDT
  console.log('Analyzing Venus USDT...');
  const venusUSDT = lowRiskPools.find(p => p.poolId === 'venus-usdt');
  if (venusUSDT) {
    const analysis = await analyzePool.analyzePool(venusUSDT.poolId, venusUSDT.address);
    console.log(`  Pool: ${analysis.poolId}`);
    console.log(`  APY: ${analysis.apy.toFixed(2)}%`);
    console.log(`  TVL: $${(analysis.tvl / 1_000_000).toFixed(2)}M`);
    console.log(`  Risk Score: ${analysis.riskScore}/100 (${analysis.riskLevel})`);
    console.log(`  Utilization: ${(analysis.utilizationRate * 100).toFixed(2)}%`);
    if (analysis.warnings.length > 0) {
      console.log(`  Warnings: ${analysis.warnings.join(', ')}`);
    }
  }

  console.log('\nAnalyzing Venus USDC...');
  const venusUSDC = lowRiskPools.find(p => p.poolId === 'venus-usdc');
  if (venusUSDC) {
    const analysis = await analyzePool.analyzePool(venusUSDC.poolId, venusUSDC.address);
    console.log(`  Pool: ${analysis.poolId}`);
    console.log(`  APY: ${analysis.apy.toFixed(2)}%`);
    console.log(`  TVL: $${(analysis.tvl / 1_000_000).toFixed(2)}M`);
    console.log(`  Risk Score: ${analysis.riskScore}/100 (${analysis.riskLevel})`);
    console.log(`  Utilization: ${(analysis.utilizationRate * 100).toFixed(2)}%`);
    if (analysis.warnings.length > 0) {
      console.log(`  Warnings: ${analysis.warnings.join(', ')}`);
    }
  }

  // Step 4: Compare pools
  console.log('\n📊 STEP 4: Comparing Venus USDT vs USDC...\n');

  if (venusUSDT && venusUSDC) {
    const comparison = await analyzePool.comparePools(
      venusUSDT.poolId,
      venusUSDT.address,
      venusUSDC.poolId,
      venusUSDC.address
    );

    console.log(`Pool 1: ${comparison.pool1.poolId}`);
    console.log(`  APY: ${comparison.pool1.apy.toFixed(2)}%`);
    console.log(`  Risk Score: ${comparison.pool1.riskScore}/100`);

    console.log(`\nPool 2: ${comparison.pool2.poolId}`);
    console.log(`  APY: ${comparison.pool2.apy.toFixed(2)}%`);
    console.log(`  Risk Score: ${comparison.pool2.riskScore}/100`);

    console.log(`\nAPY Difference: ${comparison.apyDifference > 0 ? '+' : ''}${comparison.apyDifference.toFixed(2)}%`);
    console.log(`Risk Difference: ${comparison.riskDifference > 0 ? '+' : ''}${comparison.riskDifference} points`);
    console.log(`\n💡 Recommendation: ${comparison.recommendation}`);
  }

  // Step 5: Analyze a PancakeSwap pool (if available)
  console.log('\n📊 STEP 5: Analyzing PancakeSwap pool...\n');

  const mediumRiskPools = getPools.filterPoolsByRisk(allPools, 'medium');
  const pancakePool = mediumRiskPools.find(p => p.protocol === 'pancakeswap');

  if (pancakePool) {
    try {
      console.log(`Analyzing ${pancakePool.name}...`);
      const analysis = await analyzePool.analyzePool(pancakePool.poolId);
      console.log(`  Pool: ${analysis.poolId}`);
      console.log(`  Assets: ${analysis.assets.join('-')}`);
      console.log(`  Total APY: ${analysis.apy.toFixed(2)}%`);
      console.log(`    Base APY: ${analysis.apyBase.toFixed(2)}%`);
      console.log(`    Reward APY: ${analysis.apyReward.toFixed(2)}%`);
      console.log(`  TVL: $${(analysis.tvl / 1_000_000).toFixed(2)}M`);
      console.log(`  Risk Score: ${analysis.riskScore}/100 (${analysis.riskLevel})`);
      if (analysis.warnings.length > 0) {
        console.log(`  Warnings: ${analysis.warnings.join(', ')}`);
      }
    } catch (error) {
      console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Step 6: Analyze Lista liquid staking (if available)
  console.log('\n📊 STEP 6: Analyzing Lista liquid staking...\n');

  const listaStaking = allPools.find(p => p.protocol === 'lista-staking');
  if (listaStaking) {
    try {
      console.log(`Analyzing ${listaStaking.name}...`);
      const analysis = await analyzePool.analyzePool(listaStaking.poolId);
      console.log(`  Pool: ${analysis.poolId}`);
      console.log(`  Assets: ${analysis.assets.join('-')}`);
      console.log(`  Total APY: ${analysis.apy.toFixed(2)}%`);
      console.log(`    Base APY: ${analysis.apyBase.toFixed(2)}%`);
      console.log(`    Reward APY: ${analysis.apyReward.toFixed(2)}%`);
      console.log(`  TVL: $${(analysis.tvl / 1_000_000).toFixed(2)}M`);
      console.log(`  Risk Score: ${analysis.riskScore}/100 (${analysis.riskLevel})`);
      if (analysis.warnings.length > 0) {
        console.log(`  Warnings: ${analysis.warnings.join(', ')}`);
      }
    } catch (error) {
      console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Step 7: Analyze Alpaca leveraged farm (if available - high risk)
  console.log('\n📊 STEP 7: Analyzing Alpaca leveraged farm...\n');

  const highRiskPools = getPools.filterPoolsByRisk(allPools, 'high');
  const alpacaPool = highRiskPools.find(p => p.protocol === 'alpaca');
  if (alpacaPool) {
    try {
      console.log(`Analyzing ${alpacaPool.name}...`);
      const analysis = await analyzePool.analyzePool(alpacaPool.poolId);
      console.log(`  Pool: ${analysis.poolId}`);
      console.log(`  Assets: ${analysis.assets.join('-')}`);
      console.log(`  Total APY: ${analysis.apy.toFixed(2)}%`);
      console.log(`    Base APY: ${analysis.apyBase.toFixed(2)}%`);
      console.log(`    Reward APY: ${analysis.apyReward.toFixed(2)}%`);
      console.log(`  TVL: $${(analysis.tvl / 1_000_000).toFixed(2)}M`);
      console.log(`  Risk Score: ${analysis.riskScore}/100 (${analysis.riskLevel})`);
      if (analysis.warnings.length > 0) {
        console.log(`  Warnings: ${analysis.warnings.join(', ')}`);
      }
    } catch (error) {
      console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Flow test complete!\n');

  console.log('🎯 Agent Decision Flow:');
  console.log('   1. User delegates session key');
  console.log('   2. Agent calls getPools() to discover opportunities');
  console.log('   3. Agent filters by user risk profile');
  console.log('   4. Agent calls analyzePool() for top candidates');
  console.log('   5. Agent compares pools and decides where to allocate');
  console.log('   6. Agent executes transaction via session key\n');
}

testNewFlow().catch(console.error);
