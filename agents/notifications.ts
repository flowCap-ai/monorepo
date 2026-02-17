/**
 * FlowCap Notification Service
 * Sends alerts via Telegram when key events occur.
 *
 * Configured in config.yaml:
 *   notifications.telegram.botToken / chatId
 *
 * Uses the Telegram Bot API — no external dependencies required.
 */

// ─── Config ──────────────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

export type NotificationEvent =
  | 'reallocation_executed'
  | 'yield_opportunity_found'
  | 'risk_alert'
  | 'session_key_expiring'
  | 'agent_started'
  | 'agent_stopped'
  | 'error';

interface NotificationPayload {
  event: NotificationEvent;
  title: string;
  message: string;
  data?: Record<string, string | number | boolean>;
}

/**
 * Send a notification via Telegram.
 * Silently fails if bot token / chat id are not configured.
 */
export async function sendNotification(payload: NotificationPayload): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    // Not configured — skip silently
    return false;
  }

  const emoji = {
    reallocation_executed: '🔄',
    yield_opportunity_found: '📈',
    risk_alert: '🚨',
    session_key_expiring: '⏳',
    agent_started: '🚀',
    agent_stopped: '🛑',
    error: '❌',
  }[payload.event] || 'ℹ️';

  // Build Telegram message (Markdown V2)
  let text = `${emoji} *${escapeMarkdown(payload.title)}*\n\n${escapeMarkdown(payload.message)}`;

  if (payload.data && Object.keys(payload.data).length > 0) {
    text += '\n\n';
    for (const [key, value] of Object.entries(payload.data)) {
      text += `• *${escapeMarkdown(key)}*: \`${escapeMarkdown(String(value))}\`\n`;
    }
  }

  text += `\n_${escapeMarkdown(new Date().toISOString())}_`;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const body = await res.text();
      console.warn(`⚠️ Telegram API error (${res.status}): ${body}`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn('⚠️ Telegram notification failed:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Escape special characters for Telegram MarkdownV2.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// ─── Convenience helpers ─────────────────────────────────────────

export async function notifyReallocation(
  fromPool: string,
  toPool: string,
  apyDiff: number,
  txHash?: string
): Promise<void> {
  await sendNotification({
    event: 'reallocation_executed',
    title: 'Reallocation Executed',
    message: `Moved funds from ${fromPool} to ${toPool} for +${apyDiff.toFixed(2)}% APY improvement.`,
    data: {
      from: fromPool,
      to: toPool,
      apyImprovement: `+${apyDiff.toFixed(2)}%`,
      ...(txHash ? { txHash } : {}),
    },
  });
}

export async function notifyYieldOpportunity(
  poolId: string,
  apy: number,
  protocol: string
): Promise<void> {
  await sendNotification({
    event: 'yield_opportunity_found',
    title: 'Yield Opportunity Found',
    message: `${protocol} pool ${poolId} offering ${apy.toFixed(2)}% APY.`,
    data: { pool: poolId, apy, protocol },
  });
}

export async function notifySessionExpiring(
  remainingHours: number
): Promise<void> {
  await sendNotification({
    event: 'session_key_expiring',
    title: 'Session Key Expiring Soon',
    message: `Your session key expires in ${remainingHours.toFixed(1)} hours. Please renew delegation.`,
    data: { remainingHours },
  });
}

export async function notifyError(title: string, errorMessage: string): Promise<void> {
  await sendNotification({
    event: 'error',
    title,
    message: errorMessage,
  });
}

export default {
  sendNotification,
  notifyReallocation,
  notifyYieldOpportunity,
  notifySessionExpiring,
  notifyError,
};
