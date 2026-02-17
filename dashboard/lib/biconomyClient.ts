/**
 * FlowCap — Biconomy AbstractJS + MEE API (Smart Sessions)
 *
 * Stack:
 *  - @biconomy/abstractjs     → toMultichainNexusAccount, createMeeClient, meeSessionActions
 *  - Smart Sessions module    → toSmartSessionsModule, grantPermissionTypedDataSign
 *  - MEE API key              → from NEXT_PUBLIC_BICONOMY_MEE_API_KEY
 *  - Gas                      → handled by MEE (no Pimlico, no custom bundler)
 *
 * Delegation flow:
 *  1. createSmartAccount()           → compute Nexus SA address (no tx)
 *  2. generateSessionKey()           → random session keypair (stays client-side)
 *  3. delegateSessionKey()           → typed-data signature (no gas from user)
 *     → installs SmartSessions module if needed via MEE
 *     → grants permission with time-bounded sudo policies
 *     → returns sessionDetails JSON for the agent
 */

import {
  type Address,
  type Hex,
  createWalletClient,
  custom,
  http,
  toFunctionSelector,
} from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import {
  toMultichainNexusAccount,
  createMeeClient,
  meeSessionActions,
  getMEEVersion,
  MEEVersion,
  getSudoPolicy,
} from '@biconomy/abstractjs';
import { getTimeFramePolicy } from '@rhinestone/module-sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionKeyData {
  sessionAddress: Address;
  sessionPrivateKey: Hex;   // stays LOCAL ONLY — never sent to server
  validUntil: number;
  validAfter: number;
  riskProfile: 'low' | 'medium' | 'high';
}

export interface SmartAccount {
  address: Address;
  owner: Address;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BSC_RPC = process.env.NEXT_PUBLIC_BNB_RPC_URL || 'https://1rpc.io/bnb';
const MEE_API_KEY = process.env.NEXT_PUBLIC_BICONOMY_MEE_API_KEY || '';

// BSC MEE version — V2_1_0 is stable for single-chain
const BSC_MEE_VERSION = getMEEVersion(MEEVersion.V2_1_0);

// BNB Chain addresses
const ADDR = {
  PANCAKE_V2:  '0x10ED43C718714eb63d5aA57B78B54704E256024E' as Address,
  PANCAKE_V3:  '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4' as Address,
  VENUS_VUSDT: '0xfD5840Cd36d94D7229439859C0112a4185BC0255' as Address,
  VENUS_VUSDC: '0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8' as Address,
  VENUS_VBUSD: '0x95c78222B3D6e262426483D42CfA53685A67Ab9D' as Address,
  VENUS_VBNB:  '0xA07c5b74C9B40447a954e1466938b865b6BBea36' as Address,
  VENUS_VETH:  '0xf508fCD89b8bd15579dc79A6827cB4686A3592c8' as Address,
  VENUS_VBTCB: '0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B' as Address,
  USDT:        '0x55d398326f99059fF775485246999027B3197955' as Address,
  USDC:        '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' as Address,
  BUSD:        '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' as Address,
  WBNB:        '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as Address,
  ETH:         '0x2170Ed0880ac9A755fd29B2688956BD959F933F8' as Address,
  BTCB:        '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c' as Address,
  CAKE:        '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82' as Address,
} as const;

// Venus ABI selectors
const SELECTOR = {
  MINT:         toFunctionSelector('mint(uint256)'),
  MINT_BNB:     toFunctionSelector('mint()'),
  REDEEM:       toFunctionSelector('redeem(uint256)'),
  APPROVE:      toFunctionSelector('approve(address,uint256)'),
  SWAP_TKN_TKN: toFunctionSelector('swapExactTokensForTokens(uint256,uint256,address[],address,uint256)'),
  SWAP_ETH_TKN: toFunctionSelector('swapExactETHForTokens(uint256,address[],address,uint256)'),
  SWAP_TKN_ETH: toFunctionSelector('swapExactTokensForETH(uint256,uint256,address[],address,uint256)'),
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build MEE session actions per risk profile.
 * Each action gets a sudo policy (full access) + time-frame policy (7-day window).
 */
function buildActions(
  riskProfile: 'low' | 'medium' | 'high',
  validAfter: number,
  validUntil: number,
): { chainId: number; actionTarget: Address; actionTargetSelector: Hex; actionPolicies: any[] }[] {
  const sudo = getSudoPolicy();
  const timeFrame = getTimeFramePolicy({ validAfter, validUntil });

  const entry = (actionTarget: Address, actionTargetSelector: Hex) => ({
    chainId: bsc.id,
    actionTarget,
    actionTargetSelector,
    actionPolicies: [sudo, timeFrame],
  });

  const actions = [
    // LOW — Venus stablecoins
    entry(ADDR.VENUS_VUSDT, SELECTOR.MINT),
    entry(ADDR.VENUS_VUSDT, SELECTOR.REDEEM),
    entry(ADDR.VENUS_VUSDC, SELECTOR.MINT),
    entry(ADDR.VENUS_VUSDC, SELECTOR.REDEEM),
    entry(ADDR.VENUS_VBUSD, SELECTOR.MINT),
    entry(ADDR.VENUS_VBUSD, SELECTOR.REDEEM),
    entry(ADDR.USDT,        SELECTOR.APPROVE),
    entry(ADDR.USDC,        SELECTOR.APPROVE),
    entry(ADDR.BUSD,        SELECTOR.APPROVE),
  ];

  if (riskProfile === 'medium' || riskProfile === 'high') {
    actions.push(
      entry(ADDR.VENUS_VBNB, SELECTOR.MINT_BNB),
      entry(ADDR.VENUS_VBNB, SELECTOR.REDEEM),
      entry(ADDR.PANCAKE_V2, SELECTOR.SWAP_TKN_TKN),
      entry(ADDR.PANCAKE_V2, SELECTOR.SWAP_ETH_TKN),
      entry(ADDR.PANCAKE_V2, SELECTOR.SWAP_TKN_ETH),
      entry(ADDR.WBNB,       SELECTOR.APPROVE),
    );
  }

  if (riskProfile === 'high') {
    actions.push(
      entry(ADDR.VENUS_VETH,  SELECTOR.MINT),
      entry(ADDR.VENUS_VETH,  SELECTOR.REDEEM),
      entry(ADDR.VENUS_VBTCB, SELECTOR.MINT),
      entry(ADDR.VENUS_VBTCB, SELECTOR.REDEEM),
      entry(ADDR.PANCAKE_V3,  SELECTOR.SWAP_TKN_TKN),
      entry(ADDR.PANCAKE_V3,  SELECTOR.SWAP_ETH_TKN),
      entry(ADDR.PANCAKE_V3,  SELECTOR.SWAP_TKN_ETH),
      entry(ADDR.ETH,         SELECTOR.APPROVE),
      entry(ADDR.BTCB,        SELECTOR.APPROVE),
      entry(ADDR.CAKE,        SELECTOR.APPROVE),
    );
  }

  return actions;
}

/** Build the Nexus multichain account for the connected EOA */
async function buildNexusAccount(ownerAddress: Address) {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No wallet provider');
  }

  const walletClient = createWalletClient({
    account: ownerAddress,
    chain: bsc,
    transport: custom(window.ethereum),
  });

  const nexusAccount = await toMultichainNexusAccount({
    signer: walletClient,
    chainConfigurations: [
      {
        chain: bsc,
        transport: http(BSC_RPC),
        version: BSC_MEE_VERSION,
      },
    ],
  });

  return nexusAccount;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the Nexus smart account address for the connected EOA.
 * Pure computation — no transaction, no gas.
 */
export async function createSmartAccount(ownerAddress: Address): Promise<SmartAccount> {
  try {
    const nexusAccount = await buildNexusAccount(ownerAddress);
    const addr = nexusAccount.addressOn(bsc.id, true) as Address;
    console.log('✅ Nexus Smart Account:', addr);
    return { address: addr, owner: ownerAddress };
  } catch (err) {
    console.error('createSmartAccount failed, falling back to EOA:', err);
    return { address: ownerAddress, owner: ownerAddress };
  }
}

/**
 * Generate an agent session keypair client-side.
 * Private key stored in localStorage only — never sent to server.
 */
export function generateSessionKey(
  _smartAccountAddress: Address,
  riskProfile: 'low' | 'medium' | 'high',
): SessionKeyData {
  const sessionPrivateKey = generatePrivateKey();
  const sessionAccount    = privateKeyToAccount(sessionPrivateKey);
  const now               = Math.floor(Date.now() / 1000);
  return {
    sessionAddress:   sessionAccount.address,
    sessionPrivateKey,
    validAfter:       now,
    validUntil:       now + 7 * 24 * 60 * 60,
    riskProfile,
  };
}

/**
 * Grant smart session permission via Biconomy MEE + typed-data signature.
 *
 * Uses toSmartSessionsModule + grantPermissionTypedDataSign — user only signs typed-data.
 * MEE handles gas for module installation (sponsorship mode).
 * Session time-bounds are enforced on-chain via TimeFramePolicy per action.
 *
 * Returns serialised sessionDetails for the agent to use via usePermission().
 */
export async function delegateSessionKey(
  ownerAddress: Address,
  smartAccountAddress: Address,
  sessionKeyData: SessionKeyData,
): Promise<{ success: boolean; compressedSessionData?: string; txHash?: string; error?: string }> {
  try {
    const nexusAccount = await buildNexusAccount(ownerAddress);

    const meeClientParams: Parameters<typeof createMeeClient>[0] = {
      account: nexusAccount,
    };
    if (MEE_API_KEY) {
      (meeClientParams as any).apiKey = MEE_API_KEY;
    }
    const meeClient = await createMeeClient(meeClientParams);

    // Agent signer derived from session key
    const agentSigner = privateKeyToAccount(sessionKeyData.sessionPrivateKey);

    // Extend MEE client with session actions
    const sessionClient = meeClient.extend(meeSessionActions);

    // Skip prepareForPermissions (supertransaction module install) — BSC confirmation
    // latency causes "Execution deadline limit exceeded" on MEE's L1/BSC supertxs.
    // Instead, the agent uses mode "ENABLE_AND_USE" on its first usePermission() call,
    // which installs the SmartSessions module and executes in a single UserOp.
    console.log('🔑 Granting session permissions via typed-data signature...');

    const actions = buildActions(
      sessionKeyData.riskProfile,
      sessionKeyData.validAfter,
      sessionKeyData.validUntil,
    );

    // grantPermissionTypedDataSign via meeSessionActions — user signs typed-data, no gas
    const sessionDetails = await sessionClient.grantPermissionTypedDataSign({
      redeemer: agentSigner.address,
      actions,
    });

    console.log('✅ Session permissions granted');

    const compressedSessionData = JSON.stringify({
      sessionDetails,
      smartAccountAddress,
      sessionAddress: sessionKeyData.sessionAddress,
      riskProfile:    sessionKeyData.riskProfile,
      validAfter:     sessionKeyData.validAfter,
      validUntil:     sessionKeyData.validUntil,
    });

    return { success: true, compressedSessionData };

  } catch (error: any) {
    console.error('❌ delegateSessionKey failed:', error);

    if (error.code === 4001 || error.message?.includes('User rejected')) {
      return { success: false, error: 'User rejected the signature' };
    }

    return { success: false, error: error.message || 'Session key delegation failed' };
  }
}
