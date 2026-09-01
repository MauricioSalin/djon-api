import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

type PasswordResetEmailProps = { name: string; resetUrl: string };

export function PasswordResetEmail({
  name,
  resetUrl,
}: PasswordResetEmailProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>Redefina sua senha da DJ ON Academy</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.hero}>
            <Text style={styles.eyebrow}>DJ ON ACADEMY · SEGURANÇA</Text>
            <Heading style={styles.heading}>
              Vamos criar uma nova senha.
            </Heading>
            <Text style={styles.text}>Olá, {name}.</Text>
            <Text style={styles.text}>
              Recebemos uma solicitação para redefinir a senha da sua conta.
            </Text>
          </Section>
          <Button href={resetUrl} style={styles.button}>
            REDEFINIR MINHA SENHA
          </Button>
          <Section style={styles.notice}>
            <Text style={styles.noticeTitle}>LINK VÁLIDO POR 1 HORA</Text>
            <Text style={styles.noticeText}>
              Depois desse prazo, solicite um novo link na tela de login.
            </Text>
          </Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            Se você não pediu a redefinição, ignore este e-mail. Sua senha atual
            continuará funcionando.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: '#000000',
    fontFamily: 'Arial, sans-serif',
    margin: 0,
  },
  container: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '20px',
    margin: '32px auto',
    maxWidth: '560px',
    overflow: 'hidden',
    padding: '0 40px 36px',
  },
  hero: { borderTop: '6px solid #8af23b', paddingTop: '34px' },
  eyebrow: {
    color: '#8af23b',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '2.5px',
  },
  heading: {
    color: '#ffffff',
    fontSize: '30px',
    lineHeight: '1.15',
    margin: '12px 0 24px',
  },
  text: { color: '#c7c7c7', fontSize: '15px', lineHeight: '1.65' },
  button: {
    backgroundColor: '#8af23b',
    borderRadius: '999px',
    color: '#000000',
    display: 'block',
    fontSize: '13px',
    fontWeight: '800',
    margin: '28px 0',
    padding: '15px 24px',
    textAlign: 'center' as const,
    textDecoration: 'none',
  },
  notice: {
    backgroundColor: '#121212',
    border: '1px solid #2a2a2a',
    borderRadius: '14px',
    padding: '18px 20px',
  },
  noticeTitle: {
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '1.4px',
    margin: '0 0 6px',
  },
  noticeText: {
    color: '#8a8a8a',
    fontSize: '12px',
    lineHeight: '1.5',
    margin: 0,
  },
  hr: { borderColor: '#2a2a2a', margin: '28px 0 20px' },
  footer: { color: '#8a8a8a', fontSize: '12px', lineHeight: '1.5' },
};
