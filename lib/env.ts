function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function serverEnv() {
  return {
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    adminPasswordHash: required("ADMIN_PASSWORD_HASH"),
    sessionSecret: required("SESSION_SECRET"),
    agentTokenHash: required("AGENT_TOKEN_HASH"),
  };
}
