import { ConfigService } from '@nestjs/config';
import { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Role } from '../common/enums/role.enum';
import { MailService } from './mail.service';

const send = jest.fn();
type SentMessage = { subject: string; react: ReactElement };
type SendOptions = { idempotencyKey: string };
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
}));

describe('MailService', () => {
  let service: MailService;

  beforeEach(() => {
    send
      .mockReset()
      .mockResolvedValue({ data: { id: 'email-id' }, error: null });
    const values: Record<string, string> = {
      RESEND_API_KEY: 're_test',
      RESEND_FROM_EMAIL: 'DJ ON <contato@djon.test>',
      PORTAL_LOGIN_URL: 'https://portal.djon.test/login',
      PORTAL_PASSWORD_RESET_URL: 'https://portal.djon.test/redefinir-senha',
    };
    service = new MailService({
      get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
    } as unknown as ConfigService);
  });

  it.each([
    [Role.Student, 'Bem-vindo à DJ ON Academy', 'Seu próximo set começa aqui.'],
    [
      Role.Professor,
      'Bem-vindo ao time DJ ON Academy',
      'Bem-vindo ao backstage.',
    ],
  ])(
    'envia template próprio de boas-vindas para %s',
    async (role, subject, heading) => {
      await service.sendTemporaryPassword({
        userId: 'user-id',
        name: 'Pessoa Teste',
        email: 'pessoa@teste.com',
        temporaryPassword: 'SenhaTemporaria@2026',
        role,
      });

      const [message, options] = send.mock.calls[0] as unknown as [
        SentMessage,
        SendOptions,
      ];
      expect(message.subject).toBe(subject);
      expect(options.idempotencyKey).toBe(`${role}-access-user-id`);
      const html = renderToStaticMarkup(message.react);
      expect(html).toContain(heading);
      expect(html).toContain('SenhaTemporaria@2026');
      expect(html).not.toContain('border-top:6px solid');
      expect(html).not.toContain('DJ ON ACADEMY ·');
      expect(html).not.toContain('href="mailto:');
      expect(html).not.toContain('>pessoa@teste.com<');
    },
  );

  it('envia recuperação com token apenas no link', async () => {
    await service.sendPasswordReset({
      userId: 'user-id',
      name: 'Pessoa Teste',
      email: 'pessoa@teste.com',
      token: 'token secreto',
    });

    const [message] = send.mock.calls[0] as unknown as [SentMessage];
    const html = renderToStaticMarkup(message.react);
    expect(message.subject).toBe('Redefina sua senha da DJ ON Academy');
    expect(html).toContain('token=token+secreto');
    expect(html).toContain('LINK VÁLIDO POR 1 HORA');
    expect(html).not.toContain('border-top:6px solid');
    expect(html).not.toContain('DJ ON ACADEMY · SEGURANÇA');
  });

  it('envia novo lead sem faixa ou identificador verde no topo', async () => {
    await service.sendNewSiteLead({
      leadId: 'lead-id',
      unitEmail: 'unidade@teste.com',
      unitName: 'Porto Alegre',
      firstName: 'Pessoa',
      lastName: 'Interessada',
      whatsapp: '(51) 99999-9999',
      message: 'Quero conhecer os cursos.',
    });

    const [message] = send.mock.calls[0] as unknown as [SentMessage];
    const html = renderToStaticMarkup(message.react);
    expect(message.subject).toBe('Novo contato pelo site — Porto Alegre');
    expect(html).toContain('Novo contato pelo site.');
    expect(html).toContain('VER CONTATOS');
    expect(html).toContain(
      'href="https://portal.djon.test/dashboard/admin/leads"',
    );
    expect(html).not.toContain('DJ ON ACADEMY</p>');
  });
});
