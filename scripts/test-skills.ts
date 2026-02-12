/**
 * Test script for FlowCap Agent Skills
 * Run with: npx tsx scripts/test-skills.ts
 */

import 'dotenv/config';
import getYields from '../agents/skills/getYields.js';
import riskScanner from '../agents/skills/riskScanner.js';

async function testGetYields() {
  console.log('\n========================================');
  console.log('🧪 Testing getYields.ts');
  console.log('========================================\n');

  try {
    // Test 1: Fetch Venus yields (on-chain)
    console.log('📊 Fetching Venus Protocol yields (on-chain)...');
    const venusYields = await getYields.getVenusYields();
    console.log(`   Found ${venusYields.length} Venus markets:\n`);

    for (const y of venusYields) {
      console.log(`   ${y.asset.padEnd(6)} | APY: ${y.apy.toFixed(2).padStart(6)}% | Risk: ${y.riskLevel.padEnd(6)} | TVL: $${(y.tvl / 1_000_000).toFixed(2)}M`);
    }

    // Test 2: Fetch DeFiLlama yields
    console.log('\n📊 Fetching DeFiLlama yields for BNB Chain...');
    const llamaYields = await getYields.getDefiLlamaYields(['venus', 'pancake']);
    console.log(`   Found ${llamaYields.length} pools from DeFiLlama:\n`);

    const topYields = llamaYields.slice(0, 10);
    for (const y of topYields) {
      console.log(`   ${y.protocol.padEnd(12)} | ${y.pool.slice(0, 20).padEnd(20)} | APY: ${y.apy.toFixed(2).padStart(7)}% | Risk: ${y.riskLevel}`);
    }

    // Test 3: Get best yields for each risk profile
    console.log('\n📊 Best yields by risk profile:');

    for (const profile of ['low', 'medium', 'high'] as const) {
      const best = await getYields.getBestYields(profile, 0, 3);
      console.log(`\n   [${profile.toUpperCase()}] Top 3:`);
      for (const y of best) {
        console.log(`     - ${y.protocol} ${y.pool}: ${y.apy.toFixed(2)}% APY`);
      }
    }

    // Test 4: Analyze yield opportunity
    console.log('\n📊 Analyzing yield opportunity...');
    const analysis = await getYields.analyzeYieldOpportunity(
      'Venus',
      'USDT',
      2.5, // Current APY
      'low' // Risk profile
    );
    console.log(`   Current yield: ${analysis.currentYield}%`);
    console.log(`   Best available: ${analysis.bestYield?.apy || 'N/A'}% on ${analysis.bestYield?.protocol || 'N/A'}`);
    console.log(`   APY difference: +${analysis.apyDifference.toFixed(2)}%`);
    console.log(`   Should reallocate: ${analysis.shouldReallocate ? 'YES ✅' : 'NO ❌'}`);
    console.log(`   Recommendation: ${analysis.recommendation}`);

    console.log('\n✅ getYields.ts tests PASSED\n');
    return true;
  } catch (error) {
    console.error('\n❌ getYields.ts test FAILED:', error);
    return false;
  }
}

async function testRiskScanner() {
  console.log('\n========================================');
  console.log('🧪 Testing riskScanner.ts');
  console.log('========================================\n');

  try {
    // Test 1: Analyze Venus protocol risk
    console.log('🔍 Analyzing Venus Protocol risk...');
    const venusRisk = await riskScanner.analyzeProtocolRisk('venus');
    console.log(`   Protocol: ${venusRisk.protocol}`);
    console.log(`   Overall Score: ${venusRisk.overallScore}/100`);
    console.log(`   Risk Level: ${venusRisk.riskLevel.toUpperCase()}`);
    console.log(`   TVL Score: ${venusRisk.tvlScore}/100`);
    console.log(`   Utilization Score: ${venusRisk.utilizationScore}/100`);
    console.log(`   Audit Score: ${venusRisk.auditScore}/100`);
    console.log(`   Age Score: ${venusRisk.ageScore}/100`);
    console.log(`   Details:`);
    console.log(`     - TVL: $${(venusRisk.details.tvl / 1_000_000).toFixed(2)}M`);
    console.log(`     - Utilization: ${(venusRisk.details.utilizationRate * 100).toFixed(1)}%`);
    console.log(`     - Days Active: ${venusRisk.details.daysActive}`);
    console.log(`     - Audited: ${venusRisk.details.isAudited ? 'Yes ✅' : 'No ❌'}`);
    if (venusRisk.warnings.length > 0) {
      console.log(`   Warnings:`);
      for (const w of venusRisk.warnings) {
        console.log(`     ⚠️  ${w}`);
      }
    }

    // Test 2: Analyze PancakeSwap risk
    console.log('\n🔍 Analyzing PancakeSwap risk...');
    const pancakeRisk = await riskScanner.analyzeProtocolRisk('pancakeswap');
    console.log(`   Protocol: ${pancakeRisk.protocol}`);
    console.log(`   Overall Score: ${pancakeRisk.overallScore}/100`);
    console.log(`   Risk Level: ${pancakeRisk.riskLevel.toUpperCase()}`);

    // Test 3: Get Venus market health
    console.log('\n🔍 Fetching Venus vUSDT market health (on-chain)...');
    const marketHealth = await riskScanner.getVenusMarketHealth('vUSDT');
    console.log(`   Market: ${marketHealth.market}`);
    console.log(`   Total Borrows: $${marketHealth.totalBorrows.toFixed(2)}`);
    console.log(`   Liquidity: $${marketHealth.liquidity.toFixed(2)}`);
    console.log(`   Utilization Rate: ${(marketHealth.utilizationRate * 100).toFixed(2)}%`);
    console.log(`   Collateral Factor: ${(marketHealth.collateralFactor * 100).toFixed(0)}%`);
    console.log(`   Health Score: ${marketHealth.healthScore}/100`);

    // Test 4: Compare protocol risks
    console.log('\n🔍 Comparing Venus vs PancakeSwap risk...');
    const comparison = await riskScanner.compareProtocolRisk('venus', 'pancakeswap');
    console.log(`   Safer protocol: ${comparison.safer}`);
    console.log(`   Risk difference: ${comparison.riskDifference} points`);
    console.log(`   Recommendation: ${comparison.recommendation}`);

    // Test 5: Get risk-adjusted recommendations
    console.log('\n🔍 Getting risk-adjusted recommendations for LOW risk profile...');
    const recommendations = await riskScanner.getRiskAdjustedRecommendations(
      'low',
      ['venus', 'pancakeswap', 'alpaca']
    );
    console.log(`   Recommended (${recommendations.recommended.length}):`);
    for (const r of recommendations.recommended) {
      console.log(`     ✅ ${r.protocol} (Score: ${r.score}) - ${r.reason}`);
    }
    console.log(`   Avoid (${recommendations.avoid.length}):`);
    for (const a of recommendations.avoid) {
      console.log(`     ❌ ${a.protocol} (Score: ${a.score}) - ${a.reason}`);
    }

    console.log('\n✅ riskScanner.ts tests PASSED\n');
    return true;
  } catch (error) {
    console.error('\n❌ riskScanner.ts test FAILED:', error);
    return false;
  }
}

async function main() {
  console.log('\n🚀 FlowCap Skills Test Suite');
  console.log('============================\n');

  const yieldsOk = await testGetYields();
  const riskOk = await testRiskScanner();

  console.log('\n========================================');
  console.log('📋 Test Summary');
  console.log('========================================');
  console.log(`   getYields.ts:   ${yieldsOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`   riskScanner.ts: ${riskOk ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('========================================\n');

  if (!yieldsOk || !riskOk) {
    process.exit(1);
  }
}

main().catch(console.error);
