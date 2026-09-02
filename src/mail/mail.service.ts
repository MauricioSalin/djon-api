import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { Role } from '../common/enums/role.enum';
import { PasswordResetEmail } from './templates/password-reset.email';
import { ProfessorWelcomeEmail } from './templates/professor-welcome.email';
import { StudentWelcomeEmail } from './templates/student-welcome.email';
import { NewSiteLeadEmail } from './templates/new-site-lead.email';

@Injectable()
export class MailService {
  private readonly resend?: Resend;
  private readonly from: string;
  private readonly portalUrl: string;
  private readonly passwordResetUrl: string;

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
    this.passwordResetUrl = config.get<string>(
      'PORTAL_PASSWORD_RESET_URL',
      'http://localhost:3000/redefinir-senha',
    );
  }

  async sendTemporaryPassword(data: {
    userId: string;
    name: string;
    email: string;
    temporaryPassword: string;
    role: Role.Student | Role.Professor;
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
        subject:
          data.role === Role.Professor
            ? 'Bem-vindo ao time DJ ON Academy'
            : 'Bem-vindo à DJ ON Academy',
        react:
          data.role === Role.Professor
            ? ProfessorWelcomeEmail({ ...data, portalUrl: this.portalUrl })
            : StudentWelcomeEmail({ ...data, portalUrl: this.portalUrl }),
      },
      { idempotencyKey: `${data.role}-access-${data.userId}` },
    );
    if (error) {
      throw new ServiceUnavailableException(
        'Não foi possível enviar a senha temporária por e-mail.',
      );
    }
  }

  async sendPasswordReset(data: {
    userId: string;
    name: string;
    email: string;
    token: string;
  }) {
    if (!this.resend) {
      throw new ServiceUnavailableException(
        'Envio de e-mail não configurado. Defina RESEND_API_KEY.',
      );
    }
    const resetUrl = new URL(this.passwordResetUrl);
    resetUrl.searchParams.set('token', data.token);
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: data.email,
      subject: 'Redefina sua senha da DJ ON Academy',
      react: PasswordResetEmail({
        name: data.name,
        resetUrl: resetUrl.toString(),
      }),
    });
    if (error) {
      throw new ServiceUnavailableException(
        'Não foi possível enviar o e-mail de recuperação de senha.',
      );
    }
  }

  async sendNewSiteLead(data: {
    leadId: string;
    unitEmail: string;
    unitName: string;
    firstName?: string;
    lastName?: string;
    whatsapp: string;
    message?: string;
  }) {
    if (!this.resend) {
      throw new ServiceUnavailableException(
        'Envio de e-mail não configurado. Defina RESEND_API_KEY.',
      );
    }
    const { error } = await this.resend.emails.send(
      {
        from: this.from,
        to: data.unitEmail,
        subject: `Novo contato pelo site — ${data.unitName}`,
        react: NewSiteLeadEmail({
          ...data,
          contactsUrl: new URL(
            '/dashboard/admin/leads',
            this.portalUrl,
          ).toString(),
        }),
      },
      { idempotencyKey: `site-lead-${data.leadId}` },
    );
    if (error) {
      throw new ServiceUnavailableException(
        'Não foi possível enviar o contato para a unidade por e-mail.',
      );
    }
  }
}
