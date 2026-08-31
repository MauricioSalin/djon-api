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

type TemporaryPasswordEmailProps = {
  name: string;
  email: string;
  temporaryPassword: string;
  portalUrl: string;
};

export function TemporaryPasswordEmail({
  name,
  email,
  temporaryPassword,
  portalUrl,
}: TemporaryPasswordEmailProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>Seu acesso ao portal DJ ON Academy</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.eyebrow}>DJ ON ACADEMY</Text>
          <Heading style={styles.heading}>Seu acesso está pronto.</Heading>
          <Text style={styles.text}>Olá, {name}.</Text>
          <Text style={styles.text}>
            Sua conta no portal foi criada. Use os dados abaixo no primeiro
            acesso e altere a senha em seu perfil.
          </Text>
          <Section style={styles.credentials}>
            <Text style={styles.label}>E-mail</Text>
            <Text style={styles.value}>{email}</Text>
            <Text style={styles.label}>Senha temporária</Text>
            <Text style={styles.password}>{temporaryPassword}</Text>
          </Section>
          <Button href={portalUrl} style={styles.button}>
            ACESSAR O PORTAL
          </Button>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            Se você não esperava este cadastro, fale com a equipe da DJ ON.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: '#121212',
    fontFamily: 'Arial, sans-serif',
    margin: 0,
  },
  container: {
    backgroundColor: '#1b1b1b',
    border: '1px solid #333',
    borderRadius: '18px',
    margin: '32px auto',
    maxWidth: '560px',
    padding: '40px',
  },
  eyebrow: {
    color: '#b7ef3b',
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '3px',
  },
  heading: {
    color: '#ffffff',
    fontSize: '30px',
    lineHeight: '1.1',
    margin: '12px 0 24px',
  },
  text: { color: '#c8c8c8', fontSize: '15px', lineHeight: '1.6' },
  credentials: {
    backgroundColor: '#242424',
    borderRadius: '14px',
    margin: '24px 0',
    padding: '20px',
  },
  label: {
    color: '#888888',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '1px',
    margin: '8px 0 4px',
    textTransform: 'uppercase' as const,
  },
  value: { color: '#ffffff', fontSize: '16px', margin: '0 0 16px' },
  password: {
    color: '#b7ef3b',
    fontFamily: 'monospace',
    fontSize: '20px',
    fontWeight: '700',
    letterSpacing: '1px',
    margin: 0,
  },
  button: {
    backgroundColor: '#b7ef3b',
    borderRadius: '999px',
    color: '#121212',
    display: 'block',
    fontSize: '13px',
    fontWeight: '800',
    margin: '28px 0',
    padding: '14px 24px',
    textAlign: 'center' as const,
    textDecoration: 'none',
  },
  hr: { borderColor: '#333333', margin: '28px 0 20px' },
  footer: { color: '#777777', fontSize: '12px', lineHeight: '1.5' },
};
