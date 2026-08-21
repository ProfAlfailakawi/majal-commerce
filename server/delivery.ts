import { randomUUID } from 'node:crypto';
import { MajalDatabase, withTransaction } from './database';
import { getEncryptedJson, googleAccessToken } from './secure-storage';

export interface DeliveryReadiness {
  email: { configured: boolean; provider: 'RESEND'; missing: string[] };
  push: { configured: boolean; provider: 'FCM_V1'; missing: string[] };
}

export function deliveryReadiness(): DeliveryReadiness {
  const emailMissing = [!process.env.RESEND_API_KEY?.trim() ? 'RESEND_API_KEY' : null, !process.env.RESEND_FROM?.trim() ? 'RESEND_FROM' : null].filter(Boolean) as string[];
  const pushMissing = [!process.env.FCM_PROJECT_ID?.trim() ? 'FCM_PROJECT_ID' : null].filter(Boolean) as string[];
  return {
    email: { configured: emailMissing.length === 0, provider: 'RESEND', missing: emailMissing },
    push: { configured: pushMissing.length === 0, provider: 'FCM_V1', missing: pushMissing }
  };
}

async function sendResendEmail(to: string, title: string, body: string, outboxId: number) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) throw new Error('RESEND_NOT_CONFIGURED');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': `majal-notification-${outboxId}`
    },
    body: JSON.stringify({ from, to: [to], subject: title, text: body }),
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`RESEND_${response.status}`);
}

async function sendFcm(token: string, title: string, body: string, data: Record<string, string>) {
  const projectId = process.env.FCM_PROJECT_ID?.trim();
  if (!projectId) throw new Error('FCM_NOT_CONFIGURED');
  const accessToken = await googleAccessToken();
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: { title, body }, data, webpush: { headers: { Urgency: 'high' } } } }),
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`FCM_${response.status}`);
}

type OutboxRow = {
  id: number | string;
  notification_id: string;
  channel: 'EMAIL' | 'PUSH';
  attempts: number | string;
  user_id: string;
  email: string;
  title: string;
  body: string;
  category: string;
  entity_type: string | null;
  entity_id: string | null;
};

async function claimOutbox(db: MajalDatabase, ownerId: string, row: OutboxRow) {
  const current = new Date();
  const claimedUntil = new Date(current.getTime() + 60_000).toISOString();
  return withTransaction(db, async tx => {
    await tx.prepare('DELETE FROM notification_delivery_claims WHERE outbox_id = ? AND claimed_until <= ?').run(Number(row.id), current.toISOString());
    const result = await tx.prepare('INSERT INTO notification_delivery_claims(outbox_id, owner_id, claimed_until) VALUES(?, ?, ?) ON CONFLICT(outbox_id) DO NOTHING')
      .run(Number(row.id), ownerId, claimedUntil);
    return result.changes === 1;
  });
}

async function deliverOne(db: MajalDatabase, ownerId: string, row: OutboxRow) {
  if (!(await claimOutbox(db, ownerId, row))) return;
  try {
    if (row.channel === 'EMAIL') {
      await sendResendEmail(row.email, row.title, row.body, Number(row.id));
    } else {
      const subscriptions = await db.prepare("SELECT id, token_object_key FROM push_subscriptions WHERE user_id = ? AND active = 1 ORDER BY updated_at DESC LIMIT 5")
        .all<{ id: string; token_object_key: string }>(row.user_id);
      if (!subscriptions.length) throw new Error('NO_PUSH_SUBSCRIPTION');
      let sent = 0;
      for (const subscription of subscriptions) {
        const secret = await getEncryptedJson<{ token: string }>(subscription.token_object_key, 'push-tokens', subscription.id);
        try {
          await sendFcm(secret.token, row.title, row.body, {
            notificationId: row.notification_id,
            category: row.category,
            entityType: row.entity_type || '',
            entityId: row.entity_id || ''
          });
          sent += 1;
        } catch (error) {
          if (String(error).includes('FCM_404') || String(error).includes('FCM_400')) {
            await db.prepare('UPDATE push_subscriptions SET active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), subscription.id);
          }
        }
      }
      if (!sent) throw new Error('PUSH_DELIVERY_FAILED');
    }
    const sentAt = new Date().toISOString();
    await db.prepare("UPDATE notification_outbox SET status = 'SENT', attempts = attempts + 1, sent_at = ?, last_error_code = NULL WHERE id = ? AND status = 'PENDING'")
      .run(sentAt, Number(row.id));
  } catch (error) {
    const attempts = Number(row.attempts) + 1;
    const code = error instanceof Error ? error.message.slice(0, 100) : 'DELIVERY_FAILED';
    const status = attempts >= 5 ? 'FAILED' : 'PENDING';
    const retryAt = new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString();
    await db.prepare('UPDATE notification_outbox SET status = ?, attempts = ?, available_at = ?, last_error_code = ? WHERE id = ?')
      .run(status, attempts, retryAt, code, Number(row.id));
  } finally {
    await db.prepare('DELETE FROM notification_delivery_claims WHERE outbox_id = ? AND owner_id = ?').run(Number(row.id), ownerId);
  }
}

export function startNotificationDeliveryWorker(db: MajalDatabase) {
  const ownerId = `worker_${randomUUID()}`;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const rows = await db.prepare(`
        SELECT o.id, o.notification_id, o.channel, o.attempts,
               n.user_id, n.title, n.body, n.category, n.entity_type, n.entity_id, u.email
        FROM notification_outbox o
        JOIN notification_inbox n ON n.id = o.notification_id
        JOIN users u ON u.id = n.user_id
        WHERE o.status = 'PENDING' AND o.available_at <= ?
        ORDER BY o.available_at, o.id LIMIT 25
      `).all<OutboxRow>(new Date().toISOString());
      await Promise.all(rows.map(row => deliverOne(db, ownerId, row)));
    } catch (error) {
      console.error(JSON.stringify({ severity: 'ERROR', event: 'notification_worker_failed', error: error instanceof Error ? error.message : 'unknown' }));
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 5_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
