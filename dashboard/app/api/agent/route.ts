/**
 * OpenClaw Agent API Route
 * Connects the dashboard to the real OpenClaw agent
 */

import { NextRequest, NextResponse } from 'next/server';

// Import the actual OpenClaw agent from /agents
import {
  initializeAgent,
  scanAndOptimize,
  getAgentStatus
} from '../../../../agents/index';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, smartAccountAddress, riskProfile, sessionPrivateKey } = body;

    // Set session key in environment for OpenClaw to use
    if (sessionPrivateKey) {
      process.env.SESSION_PRIVATE_KEY = sessionPrivateKey;
    }

    switch (action) {
      case 'initialize':
        if (!smartAccountAddress || !riskProfile) {
          return NextResponse.json(
            { error: 'Missing smartAccountAddress or riskProfile' },
            { status: 400 }
          );
        }

        await initializeAgent(smartAccountAddress, riskProfile);

        return NextResponse.json({
          success: true,
          message: 'Agent initialized successfully',
        });

      case 'scan':
        const scanResult = await scanAndOptimize();

        return NextResponse.json({
          success: true,
          result: scanResult,
        });

      case 'status':
        const status = getAgentStatus();

        return NextResponse.json({
          success: true,
          status,
        });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Get agent status
  try {
    const status = getAgentStatus();

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      },
      { status: 500 }
    );
  }
}
