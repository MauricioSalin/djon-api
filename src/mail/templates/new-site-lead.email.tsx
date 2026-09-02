import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

type NewSiteLeadEmailProps = {
  unitName: string;
  firstName?: string;
  lastName?: string;
  whatsapp: string;
  message?: string;
};

export function NewSiteLeadEmail({
  unitName,
  firstName,
  lastName,
  whatsapp,
  message,
}: NewSiteLeadEmailProps) {
  const name = [firstName, lastName].filter(Boolean).join(' ') || 'Visitante';
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>Novo contato recebido pelo site DJ ON</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.heading}>Novo contato pelo site.</Heading>
          <Text style={styles.text}>
            A unidade {unitName} recebeu um novo contato pela landing page.
          </Text>
          <Section style={styles.card}>
            <Text style={styles.label}>Nome</Text>
            <Text style={styles.value}>{name}</Text>
            <Text style={styles.label}>WhatsApp</Text>
            <Text style={styles.value}>{whatsapp}</Text>
            <Text style={styles.label}>Mensagem</Text>
            <Text style={styles.value}>{message || 'Não informada.'}</Text>
          </Section>
          <Hr style={styles.hr} />
          <Text style={styles.footer}>
            O contato também foi registrado no painel administrativo.
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
  heading: {
    color: '#ffffff',
    fontSize: '30px',
    lineHeight: '1.1',
    margin: '0 0 24px',
  },
  text: { color: '#c8c8c8', fontSize: '15px', lineHeight: '1.6' },
  card: {
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
  value: {
    color: '#ffffff',
    fontSize: '15px',
    lineHeight: '1.5',
    margin: '0 0 16px',
    whiteSpace: 'pre-wrap' as const,
  },
  hr: { borderColor: '#333333', margin: '28px 0 20px' },
  footer: { color: '#777777', fontSize: '12px', lineHeight: '1.5' },
};
