// ═══════════════════════════════════════════════════════
//  SUBSCRIPTION SENTINEL – SUPABASE CONFIGURATION
//  Replace these values with your Supabase project credentials.
//  Get them from: https://app.supabase.com → Project Settings → API
// ═══════════════════════════════════════════════════════

const SUPABASE_URL  = 'https://lqruhktphoamdwabmgjt.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxcnVoa3RwaG9hbWR3YWJtZ2p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NTM2OTYsImV4cCI6MjA4OTEyOTY5Nn0.NpDamkxWJjoxvSt5qBfTSb6ZYuA4mdtaj4sNDoCJEY4';

// ── Supabase client (using CDN global `supabase`) ──────
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
