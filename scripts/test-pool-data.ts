/**
 * Test script for getPoolData.ts - Single Pool Test
 * Verify fixed APIs return correct data
 */

import { getPancakeSwapPoolData } from '../agents/skills/getPoolData.js';

async function testPoolData() {
  console.log('Testing V2 and V3 Pool Data with Real APIs...\n');

  try {
    const V_initial = 1000;
    console.log(`Fetching PancakeSwap pools with V_initial = $${V_initial}...\n`);

    const pancakePools = await getPancakeSwapPoolData(V_initial);

    if (pancakePools.length === 0) {
      console.log('No PancakeSwap pools found!');
      return;
    }

    console.log(`Total pools found: ${pancakePools.length}\n`);

    // Test CAKE-WBNB pools (V2 and V3)
    const cakePools = pancakePools.filter(p => p.assets.includes('CAKE') && p.assets.includes('WBNB'));

    console.log(`Found ${cakePools.length} CAKE-WBNB pools\n`);

    for (const pool of cakePools) {
      console.log('='.repeat(60));
      console.log(`Pool: ${pool.name}`);
      console.log(`Version: ${pool.version?.toUpperCase()}`);
      console.log(`Assets: ${pool.assets.join('-')}`);
      console.log(`Address: ${pool.address}`);

      if (pool.exogenousParams) {
        const params = pool.exogenousParams;
        console.log(`\nExogenous Parameters:`);
        console.log(`  V_initial: $${params.V_initial.toLocaleString()}`);
        console.log(`  V_24h (volume): $${params.V_24h.toLocaleString()} ${params.V_24h > 0 ? '✅' : '❌'}`);
        console.log(`  TVL_lp: $${params.TVL_lp.toLocaleString()}`);
        console.log(`  Volume/TVL ratio: ${((params.V_24h / params.TVL_lp) * 100).toFixed(2)}%`);
        console.log(`  w_pair_ratio: ${params.w_pair_ratio.toFixed(6)}`);
        console.log(`  P_cake: $${params.P_cake.toFixed(4)}`);
        console.log(`  TVL_stack: $${params.TVL_stack.toLocaleString()}`);
        console.log(`  P_gas: ${params.P_gas.toFixed(4)} Gwei ${params.P_gas !== 3 ? '✅' : '⚠️'}`);
        console.log(`  P_BNB: $${params.P_BNB.toFixed(2)}`);

        // Validation
        const volumeRatio = (params.V_24h / params.TVL_lp) * 100;
        if (volumeRatio > 0.1 && volumeRatio < 20) {
          console.log(`\n✅ Volume/TVL ratio is healthy (${volumeRatio.toFixed(2)}%)`);
        } else if (volumeRatio > 20) {
          console.log(`\n⚠️  High volume/TVL ratio (${volumeRatio.toFixed(2)}%) - concentrated liquidity or low TVL`);
        }
      }
      console.log('');
    }

    console.log('\nTest completed!');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testPoolData();
