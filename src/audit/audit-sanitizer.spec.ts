import { sanitizeAuditPayload } from './audit-sanitizer';

describe('sanitizeAuditPayload', () => {
  it('preserva evidências úteis e remove credenciais e documentos sensíveis', () => {
    expect(
      sanitizeAuditPayload({
        title: 'Atualização investigável',
        password: 'segredo',
        accessToken: 'token-real',
        cpf: '00000000000',
        nested: { status: 'active', apiKey: 'chave-real' },
      }),
    ).toEqual({
      title: 'Atualização investigável',
      password: '[REDACTED]',
      accessToken: '[REDACTED]',
      cpf: '[REDACTED]',
      nested: { status: 'active', apiKey: '[REDACTED]' },
    });
  });

  it('limita textos extensos e omite conteúdo binário', () => {
    const result = sanitizeAuditPayload({
      description: 'a'.repeat(1200),
      file: new Uint8Array([1, 2, 3]),
    }) as Record<string, unknown>;

    expect(String(result.description)).toHaveLength(1001);
    expect(result.file).toBe('[BINARY OMITTED]');
  });
});
