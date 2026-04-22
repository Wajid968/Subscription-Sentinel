// ═══════════════════════════════════════════════════════
//  SUBSCRIPTION SENTINEL – SUPABASE EDGE FUNCTION
//  supabase/functions/send-reminders/index.ts
//
//  Deploys as a Deno Edge Function on Supabase.
//  Schedule daily using pg_cron (see README).
//
//  Required secrets (set via Supabase Dashboard or CLI):
//    RESEND_API_KEY  – your Resend.com API key
// ═══════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY       = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL           = 'reminders@yourdomain.com'; // Change to your verified Resend sender

Deno.serve(async (_req) => {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const today    = new Date();
    const in3Days  = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);

    const todayStr   = today.toISOString().split('T')[0];
    const in3DaysStr = in3Days.toISOString().split('T')[0];

    // ── Fetch subscriptions due in next 3 days ──────────
    const { data: subs, error: subErr } = await sb
      .from('subscriptions')
      .select('*, auth_email:user_id(email)')
      .eq('active', true)
      .gte('next_billing_date', todayStr)
      .lte('next_billing_date', in3DaysStr);

    if (subErr) throw subErr;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ message: 'No upcoming renewals found.' }), { status: 200 });
    }

    // ── Fetch user emails from auth.users ────────────────
    const userIds    = [...new Set(subs.map(s => s.user_id))];
    const { data: users, error: userErr } = await sb.auth.admin.listUsers();
    if (userErr) throw userErr;

    const emailMap: Record<string, string> = {};
    (users?.users || []).forEach(u => { emailMap[u.id] = u.email || ''; });

    // ── Group subscriptions by user ───────────────────────
    const byUser: Record<string, typeof subs> = {};
    subs.forEach(s => {
      if (!byUser[s.user_id]) byUser[s.user_id] = [];
      byUser[s.user_id].push(s);
    });

    let emailsSent = 0;
    let skipped    = 0;

    // ── For each user, check for duplicates then send ─────
    for (const [userId, userSubs] of Object.entries(byUser)) {
      const userEmail = emailMap[userId];
      if (!userEmail) continue;

      const filteredSubs = [];

      for (const sub of userSubs) {
        // Check if reminder already sent for this subscription + billing date
        const { data: existing } = await sb
          .from('reminder_logs')
          .select('id')
          .eq('user_id', userId)
          .eq('subscription_id', sub.id)
          .eq('billing_date', sub.next_billing_date)
          .maybeSingle();

        if (!existing) filteredSubs.push(sub);
        else skipped++;
      }

      if (filteredSubs.length === 0) continue;

      // ── Build email HTML ──────────────────────────────
      const subRows = filteredSubs.map(s => {
        const days = Math.round(
          (new Date(s.next_billing_date + 'T00:00:00').getTime() - today.setHours(0,0,0,0)) / 86400000
        );
        const daysLabel = days === 0 ? '🔥 <strong>Today!</strong>' : `In ${days} day${days === 1 ? '' : 's'}`;
        return `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #1e1e2a;color:#f1f1f8;font-weight:600">${s.name}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1e1e2a;color:#9ca3af">${s.category}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1e1e2a;color:#f1f1f8;font-weight:700">$${parseFloat(s.amount).toFixed(2)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1e1e2a;color:#f59e0b">${daysLabel}</td>
          </tr>
        `;
      }).join('');

      const html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Upcoming Renewals</title></head>
        <body style="margin:0;padding:0;background:#0a0a0f;font-family:'Inter',Arial,sans-serif">
          <div style="max-width:560px;margin:40px auto;background:#111118;border:1px solid rgba(255,255,255,0.07);border-radius:16px;overflow:hidden">
            <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center">
              <h1 style="margin:0;color:white;font-size:24px;font-weight:800">🔔 Upcoming Renewals</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px">Here are your subscriptions renewing soon</p>
            </div>
            <div style="padding:24px">
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <thead>
                  <tr>
                    <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.06em">Service</th>
                    <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.06em">Category</th>
                    <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.06em">Amount</th>
                    <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.06em">Renewal</th>
                  </tr>
                </thead>
                <tbody>${subRows}</tbody>
              </table>
              <p style="margin:24px 0 0;color:#6b7280;font-size:13px;text-align:center">
                Manage your subscriptions at 
                <a href="YOUR_APP_URL" style="color:#818cf8;text-decoration:none">Subscription Sentinel</a>
              </p>
            </div>
            <div style="padding:16px;text-align:center;border-top:1px solid rgba(255,255,255,0.07)">
              <p style="margin:0;color:#374151;font-size:12px">You're receiving this because you have active subscriptions.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // ── Send via Resend ───────────────────────────────
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:    FROM_EMAIL,
          to:      [userEmail],
          subject: `🔔 ${filteredSubs.length} subscription${filteredSubs.length > 1 ? 's' : ''} renewing soon`,
          html,
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error(`Resend error for ${userEmail}:`, errText);
        continue;
      }

      // ── Log reminder sent ─────────────────────────────
      const logs = filteredSubs.map(s => ({
        user_id:         userId,
        subscription_id: s.id,
        billing_date:    s.next_billing_date,
      }));
      await sb.from('reminder_logs').insert(logs);
      emailsSent++;
    }

    return new Response(
      JSON.stringify({ message: `Done. Emails sent: ${emailsSent}. Skipped (duplicate): ${skipped}.` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    console.error('Edge function error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
