// Trage hier die öffentliche Supabase-Projekt-URL und den publishable/anon key ein.
// Diese Werte dürfen im Browser stehen. Niemals den service_role-Schlüssel verwenden.
export const config = {
  supabaseUrl: 'https://potvfvqyiivrhnikpfhu.supabase.co',
  supabaseAnonKey: 'sb_publishable_GXg0fRcKosf8EBsMAJ7Cuw_tYDCD5c9',
  tiktokHandle: 'tay_rowdy',
  tiktokUrl: 'https://www.tiktok.com/@tay_rowdy',
  serverAddress: 'boerboel.aternos.host',
  serverPort: 62855,
  serverStatusUrl: './server-status.json',
};

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
