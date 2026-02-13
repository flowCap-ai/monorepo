/**
 * FlowCap Agent Skills
 * Export all skills for use by the agent
 */

// Core skills (new dynamic flow)
export * from './getPools.js';
export * from './analyzePool.js';
export * from './execSwap.js';

// Default exports
export { default as getPools } from './getPools.js';
export { default as analyzePool } from './analyzePool.js';
export { default as execSwap } from './execSwap.js';
