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
    ...(config.NODE_ENV === 'production'
      ? [
          'RESEND_API_KEY',
          'RESEND_FROM_EMAIL',
          'PORTAL_LOGIN_URL',
          'PORTAL_PASSWORD_RESET_URL',
        ]
      : []),
  ];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
  }

  return config;
}
