/**
 * FlowCap Delegation API Route
 *
 * Receives delegation from frontend and forwards to SERVER where OpenClaw runs
 * Server saves session key and starts autonomous trading
 */

import { NextRequest, NextResponse } from 'next/server';

// SERVER endpoint where OpenClaw is running
const SERVER_URL = process.env.FLOWCAP_SERVER_URL || 'http://localhost:3001';

interface DelegationRequest {
  sessionKey: string;
  sessionAddress: string;
  smartAccountAddress: string;
  riskProfile: 'low' | 'medium' | 'high';
  maxInvestment: string;
  validUntil: number;
  permissions: Array<{
    target: string;
    functionSelector: string;
    valueLimit: string;
  }>;
  chain: {
    id: number;
    name: string;
  };
}

export async function POST(request: NextRequest) {
  console.log('🔔 API Route /api/delegate called');

  try {
    const body: DelegationRequest = await request.json();

    console.log('📦 Request body received:', {
      hasSessionKey: !!body.sessionKey,
      smartAccountAddress: body.smartAccountAddress,
      riskProfile: body.riskProfile,
      maxInvestment: body.maxInvestment,
    });

    // Validate required fields
    const { sessionKey, smartAccountAddress, riskProfile, maxInvestment } = body;

    if (!sessionKey || !smartAccountAddress || !riskProfile || !maxInvestment) {
      console.error('❌ Validation failed: Missing required fields');
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('📤 Sending delegation to server:', {
      smartAccountAddress,
      riskProfile,
      maxInvestment,
      server: SERVER_URL,
    });

    // Create delegation payload
    const delegationId = `${smartAccountAddress.toLowerCase()}-${Date.now()}`;
    const delegationData = {
      id: delegationId,
      timestamp: Date.now(),
      status: 'active',
      ...body,
    };

    // Send to SERVER where OpenClaw is running
    try {
      const serverResponse = await fetch(`${SERVER_URL}/api/flowcap/delegate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Optional: Add auth if server is public
          // 'Authorization': `Bearer ${process.env.SERVER_API_KEY}`,
        },
        body: JSON.stringify(delegationData),
      });

      if (!serverResponse.ok) {
        const errorText = await serverResponse.text();
        console.error('❌ Server rejected delegation:', errorText);
        return NextResponse.json(
          { success: false, error: 'Server rejected delegation', details: errorText },
          { status: 500 }
        );
      }

      const serverResult = await serverResponse.json();
      console.log('✅ Server accepted delegation:', serverResult);

      return NextResponse.json({
        success: true,
        delegationId,
        message: 'Delegation sent to server successfully',
        smartAccountAddress,
        riskProfile,
        server: SERVER_URL,
      });

    } catch (serverError) {
      console.error('❌ Failed to reach server:', serverError);
      return NextResponse.json(
        {
          success: false,
          error: 'Could not reach FlowCap server',
          details: serverError instanceof Error ? serverError.message : 'Unknown error',
          server: SERVER_URL,
        },
        { status: 503 }
      );
    }

  } catch (error: any) {
    console.error('❌ Delegation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Delegation failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'FlowCap Delegation API',
    endpoints: {
      POST: '/api/delegate - Submit delegation data',
    },
  });
}
