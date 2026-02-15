/**
 * Test script for risk profile filtering in getPoolData
 * Verify that pools are correctly filtered by risk profile
 */

import { getAllPoolData, getPancakeSwapPoolData } from '../agents/skills/getPoolData.js';

async function testRiskFiltering() {
  console.log('Testing Risk Profile Filtering...\n');

  const V_initial = 1000;

  try {
    // Test 1: Get all pools without filter
    console.log('='.repeat(60));
    console.log('Test 1: Fetching ALL pools (no filter)');
    console.log('='.repeat(60));
    const allPools = await getAllPoolData(V_initial);
    console.log(`Total pools: ${allPools.length}\n`);

    // Test 2: Low risk profile
    console.log('='.repeat(60));
    console.log('Test 2: Fetching LOW risk pools');
    console.log('='.repeat(60));
    const lowRiskPools = await getAllPoolData(V_initial, 'low');
    console.log(`Low risk pools: ${lowRiskPools.length}`);
    console.log('\nLow risk pools include:');
    lowRiskPools.slice(0, 5).forEach(p => {
      console.log(`  - ${p.protocol}: ${p.name} (${p.assets.join('-')})`);
    });
    console.log('');

    // Test 3: Medium risk profile
    console.log('='.repeat(60));
    console.log('Test 3: Fetching MEDIUM risk pools');
    console.log('='.repeat(60));
    const mediumRiskPools = await getAllPoolData(V_initial, 'medium');
    console.log(`Medium risk pools: ${mediumRiskPools.length}`);
    console.log('\nMedium risk pools include:');
    mediumRiskPools.slice(0, 5).forEach(p => {
      console.log(`  - ${p.protocol}: ${p.name} (${p.assets.join('-')})`);
    });
    console.log('');

    // Test 4: High risk profile
    console.log('='.repeat(60));
    console.log('Test 4: Fetching HIGH risk pools');
    console.log('='.repeat(60));
    const highRiskPools = await getAllPoolData(V_initial, 'high');
    console.log(`High risk pools: ${highRiskPools.length}`);
    console.log('\nHigh risk pools include:');
    highRiskPools.slice(0, 5).forEach(p => {
      console.log(`  - ${p.protocol}: ${p.name} (${p.assets.join('-')})`);
    });
    console.log('');

    // Test 5: PancakeSwap only with risk filter
    console.log('='.repeat(60));
    console.log('Test 5: PancakeSwap pools with MEDIUM risk');
    console.log('='.repeat(60));
    const pancakeMedium = await getPancakeSwapPoolData(V_initial, 'medium');
    console.log(`PancakeSwap medium risk pools: ${pancakeMedium.length}`);
    if (pancakeMedium.length > 0) {
      console.log('\nExample pool:');
      const example = pancakeMedium[0];
      console.log(`  Name: ${example.name}`);
      console.log(`  Assets: ${example.assets.join('-')}`);
      console.log(`  Version: ${example.version}`);
      console.log(`  Address: ${example.address}`);
      if (example.exogenousParams) {
        console.log(`  TVL: $${example.exogenousParams.TVL_lp.toLocaleString()}`);
        console.log(`  24h Volume: $${example.exogenousParams.V_24h.toLocaleString()}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Summary:');
    console.log('='.repeat(60));
    console.log(`All pools:     ${allPools.length}`);
    console.log(`Low risk:      ${lowRiskPools.length}`);
    console.log(`Medium risk:   ${mediumRiskPools.length}`);
    console.log(`High risk:     ${highRiskPools.length}`);
    console.log('\n✅ Risk filtering test completed!');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testRiskFiltering();
