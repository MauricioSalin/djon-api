export enum PortalHeroKey {
  AdminHome = 'admin-home',
  ProfessorHome = 'professor-home',
  StudentHome = 'student-home',
  Mural = 'mural',
  Materials = 'materials',
  StudentCourses = 'student-courses',
  StaffCourses = 'staff-courses',
  StudentBookings = 'student-bookings',
  StudentEvents = 'student-events',
  ProfessorEvents = 'professor-events',
  AdminEvents = 'admin-events',
}

export type PortalHeroDefaults = {
  key: PortalHeroKey;
  label: string;
  title: string;
  description: string;
  banner: string | null;
};

export const PORTAL_HERO_DEFAULTS: readonly PortalHeroDefaults[] = [
  {
    key: PortalHeroKey.AdminHome,
    label: 'PAINEL ADMINISTRATIVO',
    title: 'DJ ON\nAcademy.',
    description:
      'Gerencie alunos, eventos e agendamentos da academia em um só lugar.',
    banner: '/images/djon-showcase.png',
  },
  {
    key: PortalHeroKey.ProfessorHome,
    label: 'PROFESSOR',
    title: '{{nome}},\npronto pra\nensinar?',
    description:
      'Conduza suas turmas, acompanhe seus alunos e compartilhe sua experiência com a próxima geração de DJs.',
    banner: '/images/djon-showcase.png',
  },
  {
    key: PortalHeroKey.StudentHome,
    label: 'BEM-VINDO DE VOLTA',
    title: '{{nome}},\no que vamos\nfazer hoje?',
    description:
      'Explore seus cursos, acompanhe sua evolução e continue desenvolvendo sua identidade como DJ.',
    banner: '/images/djon-hero.png',
  },
  {
    key: PortalHeroKey.Mural,
    label: 'COMUNIDADE',
    title: 'Mural de\nEventos.',
    description:
      'Veja o que está acontecendo na comunidade DJ ON — shows, formaturas e eventos dos seus colegas.',
    banner: '/images/mural-hero.png',
  },
  {
    key: PortalHeroKey.Materials,
    label: '{{portal_material}}',
    title: 'Material',
    description: '{{descricao_material}}',
    banner: '/images/material-hero.png',
  },
  {
    key: PortalHeroKey.StudentCourses,
    label: 'PORTAL DO ALUNO',
    title: 'Cursos',
    description:
      'Acompanhe sua formação e conheça os próximos cursos disponíveis na DJ ON Academy.',
    banner: '/images/djon-hero.png',
  },
  {
    key: PortalHeroKey.StaffCourses,
    label: 'GESTÃO ACADÊMICA',
    title: 'Turmas',
    description:
      'Acompanhe as turmas, os alunos e o andamento dos cursos da DJ ON Academy.',
    banner: '/images/djon-hero.png',
  },
  {
    key: PortalHeroKey.StudentBookings,
    label: 'PORTAL DO ALUNO',
    title: 'Agendamentos',
    description:
      'Solicite seus treinos nos horários disponíveis. Aulas são agendadas diretamente pelos professores ou pela administração.',
    banner: '/images/djon-hero.png',
  },
  {
    key: PortalHeroKey.StudentEvents,
    label: 'MEUS EVENTOS',
    title: 'Onde Você\nVai Tocar.',
    description:
      'Divulgue seus shows no mural da comunidade e marque sua presença na cena.',
    banner: '/images/mural-hero.png',
  },
  {
    key: PortalHeroKey.ProfessorEvents,
    label: 'MEUS EVENTOS',
    title: 'Onde Você\nVai Tocar.',
    description:
      'Divulgue seus shows no mural da comunidade e compartilhe sua agenda com os alunos.',
    banner: '/images/mural-hero.png',
  },
  {
    key: PortalHeroKey.AdminEvents,
    label: 'ADMINISTRAÇÃO',
    title: 'Gerenciar\nEventos.',
    description:
      'Publique eventos oficiais e acompanhe as divulgações da comunidade DJ ON.',
    banner: '/images/mural-hero.png',
  },
] as const;

export const PORTAL_HERO_KEYS = new Set<string>(
  PORTAL_HERO_DEFAULTS.map(({ key }) => key),
);

export const PORTAL_HERO_LEGACY_DESCRIPTIONS = [
  {
    key: PortalHeroKey.ProfessorHome,
    previous: '{{resumo_agendamentos}}',
    next: portalHeroDefaults(PortalHeroKey.ProfessorHome).description,
  },
  {
    key: PortalHeroKey.StudentHome,
    previous: '{{resumo_aulas}}',
    next: portalHeroDefaults(PortalHeroKey.StudentHome).description,
  },
] as const;

export function portalHeroDefaults(key: PortalHeroKey) {
  return PORTAL_HERO_DEFAULTS.find((item) => item.key === key)!;
}
