/**
 * Test script for getPoolData.ts - Single Pool Test
 * Verify fixed APIs return correct data
 */

import { getPancakeSwapPoolData } from '../agents/skills/getPoolData.js';

async function testPoolData() {
  console.log('Testing Fixed Pool Data with Real APIs...\n');

  try {
    const V_initial = 1000;
    console.log(`Fetching first PancakeSwap pool with V_initial = $${V_initial}...\n`);

    // Get only the first pool to test quickly
    const pancakePools = await getPancakeSwapPoolData(V_initial);

    if (pancakePools.length === 0) {
      console.log('No PancakeSwap pools found!');
      return;
    }

    // Test CAKE-WBNB pool (most liquid)
    const pool = pancakePools.find(p => p.name === 'CAKE-WBNB') || pancakePools[0];
    console.log('=== POOL DATA WITH FIXED APIS ===\n');
    console.log(`Pool: ${pool.name}`);
    console.log(`Assets: ${pool.assets.join('-')}`);
    console.log(`Address: ${pool.address}`);

    if (pool.exogenousParams) {
      const params = pool.exogenousParams;
      console.log(`\n=== EXOGENOUS PARAMETERS ===`);
      console.log(`r (price ratio): ${params.r.toFixed(4)}`);
      console.log(`V_initial (user investment): $${params.V_initial.toLocaleString()}`);
      console.log(`V_24h (24h volume): $${params.V_24h.toLocaleString()} ${params.V_24h > 0 ? '✅' : '❌'}`);
      console.log(`TVL_lp (liquidity): $${params.TVL_lp.toLocaleString()}`);
      console.log(`w_pair_ratio (weight): ${params.w_pair_ratio.toFixed(6)}`);
      console.log(`P_cake (CAKE price): $${params.P_cake.toFixed(4)}`);
      console.log(`TVL_stack (staked): $${params.TVL_stack.toLocaleString()} ${params.TVL_stack !== params.TVL_lp ? '✅' : '⚠️'}`);
      console.log(`P_gas (gas price): ${params.P_gas.toFixed(4)} Gwei ${params.P_gas !== 3 ? '✅' : '⚠️'}`);
      console.log(`P_BNB (BNB price): $${params.P_BNB.toFixed(2)}`);

      // Validation
      console.log('\n=== VALIDATION ===');
      const issues = [];
      if (params.V_24h === 0) issues.push('❌ 24h volume is $0');
      if (params.TVL_stack === params.TVL_lp) issues.push('⚠️  Staking TVL equals LP TVL (may be correct)');
      if (params.P_gas === 3) issues.push('⚠️  Gas price is fallback value (3 Gwei)');

      if (issues.length === 0) {
        console.log('✅ All parameters have real data!');
      } else {
        console.log('Issues found:');
        issues.forEach(issue => console.log(`  ${issue}`));
      }
    } else {
      console.log('\n❌ No exogenous parameters found!');
    }

    console.log('\nTest completed!');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testPoolData();
