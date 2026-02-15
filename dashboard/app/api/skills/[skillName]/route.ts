/**
 * OpenClaw Skills API Route
 * Exposes individual skills to the dashboard
 */

import { NextRequest, NextResponse } from 'next/server';

// Import actual OpenClaw skills
import * as getPoolDataSkill from '../../../../../agents/skills/getPoolData';
import * as analyzePoolSkill from '../../../../../agents/skills/analyzePool';
import * as execSwapSkill from '../../../../../agents/skills/execSwap';

const skills = {
  getPoolData: getPoolDataSkill,
  analyzePool: analyzePoolSkill,
  execSwap: execSwapSkill,
};

export async function GET(
  request: NextRequest,
  { params }: { params: { skillName: string } }
) {
  try {
    const { skillName } = params;

    if (!skills[skillName as keyof typeof skills]) {
      return NextResponse.json(
        { error: `Skill not found: ${skillName}` },
        { status: 404 }
      );
    }

    const skill = skills[skillName as keyof typeof skills];

    // Return skill metadata
    return NextResponse.json({
      success: true,
      skillName,
      exports: Object.keys(skill),
    });
  } catch (error) {
    console.error('Skill API error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { skillName: string } }
) {
  try {
    const { skillName } = params;
    const body = await request.json();
    const { method, args } = body;

    if (!skills[skillName as keyof typeof skills]) {
      return NextResponse.json(
        { error: `Skill not found: ${skillName}` },
        { status: 404 }
      );
    }

    const skill = skills[skillName as keyof typeof skills];

    // Execute the skill method
    if (typeof skill[method as keyof typeof skill] !== 'function') {
      return NextResponse.json(
        { error: `Method not found: ${method}` },
        { status: 404 }
      );
    }

    const result = await (skill[method as keyof typeof skill] as any)(...(args || []));

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Skill execution error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      },
      { status: 500 }
    );
  }
}
