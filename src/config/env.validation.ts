export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const required = [
    'MONGODB_URI',
    'JWT_SECRET',
    'R2_ENDPOINT',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
  ];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
  }

  return config;
}
