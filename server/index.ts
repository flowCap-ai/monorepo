#!/usr/bin/env tsx
/**
 * FlowCap Server - Receives delegations from dashboard
 * Saves to OpenClaw directory for skill to process
 */

import express from 'express';
import cors from 'cors';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const app = express();
const PORT = process.env.PORT || 3001;

// OpenClaw delegations directory
const DELEGATIONS_DIR = join(homedir(), '.openclaw', 'flowcap-delegations');

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'flowcap-server' });
});

// Receive delegation from dashboard
app.post('/api/flowcap/delegate', async (req, res) => {
  console.log('📥 Received delegation from dashboard');

  try {
    const delegationData = req.body;

    // Validate
    if (!delegationData.sessionKey || !delegationData.smartAccountAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionKey, smartAccountAddress',
      });
    }

    console.log('✅ Delegation valid:', {
      account: delegationData.smartAccountAddress,
      risk: delegationData.riskProfile,
      amount: delegationData.maxInvestment,
    });

    // Create delegations directory if needed
    if (!existsSync(DELEGATIONS_DIR)) {
      mkdirSync(DELEGATIONS_DIR, { recursive: true });
      console.log('📁 Created delegations directory');
    }

    // Save individual delegation file
    const filePath = join(DELEGATIONS_DIR, `${delegationData.id}.json`);
    writeFileSync(filePath, JSON.stringify(delegationData, null, 2));
    console.log('💾 Saved delegation file:', filePath);

    // Update active.json
    const activeFile = join(DELEGATIONS_DIR, 'active.json');
    let activeDelegations = [];
    if (existsSync(activeFile)) {
      try {
        const data = readFileSync(activeFile, 'utf-8');
        activeDelegations = JSON.parse(data);
      } catch (error) {
        console.warn('⚠️ Could not parse active.json, creating new');
      }
    }
    activeDelegations.push(delegationData);
    writeFileSync(activeFile, JSON.stringify(activeDelegations, null, 2));
    console.log('📝 Updated active.json');

    // Create monitoring instruction
    const monitorInstruction = {
      command: 'start-flowcap-monitoring',
      delegation: {
        smartAccountAddress: delegationData.smartAccountAddress,
        sessionKey: delegationData.sessionKey,
        sessionAddress: delegationData.sessionAddress,
        riskProfile: delegationData.riskProfile,
        maxInvestment: delegationData.maxInvestment,
        chain: delegationData.chain,
        permissions: delegationData.permissions,
      },
      config: {
        checkInterval: 300000, // 5 minutes
        minAPYImprovement:
          delegationData.riskProfile === 'low'
            ? 2.0
            : delegationData.riskProfile === 'medium'
            ? 1.5
            : 1.0,
        minHoldingPeriod:
          delegationData.riskProfile === 'low'
            ? 7
            : delegationData.riskProfile === 'medium'
            ? 3
            : 1,
      },
    };
    const monitorFile = join(DELEGATIONS_DIR, `monitor-${delegationData.id}.json`);
    writeFileSync(monitorFile, JSON.stringify(monitorInstruction, null, 2));
    console.log('⚙️ Created monitoring instruction');

    // Create WhatsApp notification (optional)
    const whatsappMessage = `🦞 FlowCap Delegation Active\n\nAccount: ${delegationData.smartAccountAddress}\nRisk: ${delegationData.riskProfile.toUpperCase()}\nAmount: $${delegationData.maxInvestment}\n\nMonitoring started automatically!`;
    const whatsappFile = join(DELEGATIONS_DIR, `whatsapp-${delegationData.id}.txt`);
    writeFileSync(whatsappFile, whatsappMessage);
    console.log('📱 Created WhatsApp notification');

    console.log('✅ Delegation processed successfully\n');

    res.json({
      success: true,
      delegationId: delegationData.id,
      message: 'Delegation received and OpenClaw will start monitoring',
      monitoring: {
        checkInterval: '5 minutes',
        directory: DELEGATIONS_DIR,
      },
    });
  } catch (error) {
    console.error('❌ Error processing delegation:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get delegation status
app.get('/api/flowcap/status/:delegationId?', (req, res) => {
  try {
    const { delegationId } = req.params;

    if (!existsSync(DELEGATIONS_DIR)) {
      return res.json({ delegations: [], count: 0 });
    }

    const activeFile = join(DELEGATIONS_DIR, 'active.json');
    if (!existsSync(activeFile)) {
      return res.json({ delegations: [], count: 0 });
    }

    const data = readFileSync(activeFile, 'utf-8');
    const delegations = JSON.parse(data);

    if (delegationId) {
      const delegation = delegations.find((d: any) => d.id === delegationId);
      if (!delegation) {
        return res.status(404).json({ error: 'Delegation not found' });
      }
      return res.json({ delegation });
    }

    res.json({
      delegations,
      count: delegations.length,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
🦞 FlowCap Server Running

Port: ${PORT}
Delegations: ${DELEGATIONS_DIR}
OpenClaw: Monitoring for new delegations

Endpoints:
  POST /api/flowcap/delegate - Receive delegation from dashboard
  GET  /api/flowcap/status   - Get all delegations
  GET  /health               - Health check
  `);
});
