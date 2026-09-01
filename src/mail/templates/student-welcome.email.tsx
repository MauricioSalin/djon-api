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

type StudentWelcomeEmailProps = {
  name: string;
  email: string;
  temporaryPassword: string;
  portalUrl: string;
};

export function StudentWelcomeEmail({
  name,
  email,
  temporaryPassword,
  portalUrl,
}: StudentWelcomeEmailProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>Boas-vindas à DJ ON Academy — seu acesso está pronto</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.hero}>
            <Text style={styles.eyebrow}>DJ ON ACADEMY · ALUNO</Text>
            <Heading style={styles.heading}>
              Seu próximo set começa aqui.
            </Heading>
            <Text style={styles.intro}>Olá, {name}!</Text>
            <Text style={styles.text}>
              Que bom ter você com a gente. No portal você acompanha aulas,
              agenda seus treinos e acessa os materiais da sua jornada.
            </Text>
          </Section>
          <Section style={styles.credentials}>
            <Text style={styles.credentialsTitle}>SEU PRIMEIRO ACESSO</Text>
            <Text style={styles.label}>E-mail</Text>
            <Text style={styles.value}>{email}</Text>
            <Text style={styles.label}>Senha temporária</Text>
            <Text style={styles.password}>{temporaryPassword}</Text>
          </Section>
          <Text style={styles.hint}>
            Por segurança, você deverá criar uma senha pessoal assim que entrar.
          </Text>
          <Button href={portalUrl} style={styles.button}>
            ACESSAR MEU PORTAL
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
    fontSize: '32px',
    lineHeight: '1.1',
    margin: '12px 0 24px',
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
    border: '1px solid #2a2a2a',
    borderRadius: '14px',
    margin: '24px 0 14px',
    padding: '20px',
  },
  credentialsTitle: {
    color: '#8af23b',
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
    color: '#8af23b',
    fontFamily: 'monospace',
    fontSize: '21px',
    fontWeight: '700',
    letterSpacing: '1px',
    margin: 0,
  },
  hint: { color: '#8a8a8a', fontSize: '12px', lineHeight: '1.5' },
  button: {
    backgroundColor: '#8af23b',
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
