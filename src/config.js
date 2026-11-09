// Trage hier die öffentliche Supabase-Projekt-URL und den publishable/anon key ein.
// Diese Werte dürfen im Browser stehen. Niemals den service_role-Schlüssel verwenden.
export const config = {
  supabaseUrl: 'https://potvfvqyiivrhnikpfhu.supabase.co',
  supabaseAnonKey: '',
  tiktokHandle: 'tay_rowdy',
  tiktokUrl: 'https://www.tiktok.com/@tay_rowdy',
  serverAddress: 'boerboel.aternos.host',
  serverPort: 62855,
  serverStatusUrl: 'https://api.mcsrvstat.us/3/boerboel.aternos.host:62855',
};

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
