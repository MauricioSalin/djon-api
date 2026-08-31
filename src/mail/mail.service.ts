import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { TemporaryPasswordEmail } from './templates/temporary-password.email';

@Injectable()
export class MailService {
  private readonly resend?: Resend;
  private readonly from: string;
  private readonly portalUrl: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : undefined;
    this.from = config.get<string>(
      'RESEND_FROM_EMAIL',
      'DJ ON Academy <onboarding@resend.dev>',
    );
    this.portalUrl = config.get<string>(
      'PORTAL_LOGIN_URL',
      'http://localhost:3000/login',
    );
  }

  async sendTemporaryPassword(data: {
    userId: string;
    name: string;
    email: string;
    temporaryPassword: string;
  }) {
    if (!this.resend) {
      throw new ServiceUnavailableException(
        'Envio de e-mail não configurado. Defina RESEND_API_KEY.',
      );
    }
    const { error } = await this.resend.emails.send(
      {
        from: this.from,
        to: data.email,
        subject: 'Seu acesso ao portal DJ ON Academy',
        react: TemporaryPasswordEmail({
          name: data.name,
          email: data.email,
          temporaryPassword: data.temporaryPassword,
          portalUrl: this.portalUrl,
        }),
      },
      { idempotencyKey: `student-access-${data.userId}` },
    );
    if (error) {
      throw new ServiceUnavailableException(
        'Não foi possível enviar a senha temporária por e-mail.',
      );
    }
  }
}
