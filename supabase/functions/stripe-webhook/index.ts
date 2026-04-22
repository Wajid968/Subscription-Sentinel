// ═══════════════════════════════════════════════════════
//  SAAS UPGRADE: STRIPE WEBHOOK EDGE FUNCTION
//  supabase/functions/stripe-webhook/index.ts
// ═══════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})

const cryptoProvider = Stripe.createSubtleCryptoProvider()

serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')

  // 1. Verify webhook signature
  try {
    if (!signature) throw new Error('Missing signature')
    const body = await req.text()
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
      undefined,
      cryptoProvider
    )

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log(`🔔 Webhook received: ${event.type}`)

    // 2. Handle events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const customerId = session.customer
        
        // Update user to Pro
        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ is_pro: true })
          .eq('stripe_customer_id', customerId)
        
        if (error) throw error
        console.log(`✅ User promoted to Pro: ${customerId}`)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const customerId = subscription.customer
        
        // Revoke Pro status
        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ is_pro: false })
          .eq('stripe_customer_id', customerId)
        
        if (error) throw error
        console.log(`❌ User Pro status revoked: ${customerId}`)
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (err) {
    console.error(`❌ Webhook Error: ${err.message}`)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }
})
