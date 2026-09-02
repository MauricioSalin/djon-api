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

type ProfessorWelcomeEmailProps = {
  name: string;
  email: string;
  temporaryPassword: string;
  portalUrl: string;
};

export function ProfessorWelcomeEmail({
  name,
  email,
  temporaryPassword,
  portalUrl,
}: ProfessorWelcomeEmailProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>Bem-vindo ao time DJ ON Academy — acesse o portal</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.hero}>
            <Heading style={styles.heading}>Bem-vindo ao backstage.</Heading>
            <Text style={styles.intro}>Olá, {name}!</Text>
            <Text style={styles.text}>
              Seu acesso de professor está pronto. Pelo portal você acompanha
              sua agenda, suas turmas e a evolução dos alunos.
            </Text>
          </Section>
          <Section style={styles.credentials}>
            <Text style={styles.credentialsTitle}>CREDENCIAIS DE ACESSO</Text>
            <Text style={styles.label}>E-mail profissional</Text>
            <Text style={styles.value}>
              <span>{email.slice(0, email.indexOf('@'))}</span>
              <span>{email.slice(email.indexOf('@'))}</span>
            </Text>
            <Text style={styles.label}>Senha temporária</Text>
            <Text style={styles.password}>{temporaryPassword}</Text>
          </Section>
          <Text style={styles.hint}>
            No primeiro acesso, troque esta senha por uma senha pessoal.
          </Text>
          <Button href={portalUrl} style={styles.button}>
            ENTRAR NO PORTAL
          </Button>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            Dúvidas sobre seu acesso? Fale com a administração da DJ ON.
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
  hero: { paddingTop: '34px' },
  heading: {
    color: '#ffffff',
    fontSize: '32px',
    lineHeight: '1.1',
    margin: '0 0 24px',
  },
  intro: {
    color: '#ffffff',
    fontSize: '17px',
    fontWeight: '700',
    margin: '0 0 8px',
  },
  text: { color: '#c7c7c7', fontSize: '15px', lineHeight: '1.65' },
  credentials: {
    backgroundColor: '#121212',
    border: '1px solid #403b52',
    borderRadius: '14px',
    margin: '24px 0 14px',
    padding: '20px',
  },
  credentialsTitle: {
    color: '#c5b7f2',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '1.5px',
    margin: '0 0 16px',
  },
  label: {
    color: '#8a8a8a',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '1px',
    margin: '8px 0 4px',
    textTransform: 'uppercase' as const,
  },
  value: { color: '#ffffff', fontSize: '16px', margin: '0 0 16px' },
  password: {
    color: '#c5b7f2',
    fontFamily: 'monospace',
    fontSize: '21px',
    fontWeight: '700',
    letterSpacing: '1px',
    margin: 0,
  },
  hint: { color: '#8a8a8a', fontSize: '12px', lineHeight: '1.5' },
  button: {
    backgroundColor: '#c5b7f2',
    borderRadius: '999px',
    color: '#000000',
    display: 'block',
    fontSize: '13px',
    fontWeight: '800',
    margin: '26px 0',
    padding: '15px 24px',
    textAlign: 'center' as const,
    textDecoration: 'none',
  },
  hr: { borderColor: '#2a2a2a', margin: '28px 0 20px' },
  footer: { color: '#8a8a8a', fontSize: '12px', lineHeight: '1.5' },
};
