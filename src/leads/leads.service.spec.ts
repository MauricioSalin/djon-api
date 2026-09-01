import { LeadsService } from './leads.service';

describe('LeadsService - contato da landing', () => {
  const leadModel = {
    create: jest.fn().mockResolvedValue({ id: 'lead-1' }),
  };
  const usersService = {
    findActiveByRoles: jest.fn().mockResolvedValue([{ _id: 'admin-1' }]),
  };
  const notificationsService = {
    createForRecipients: jest.fn().mockResolvedValue(undefined),
  };
  const unitsService = {
    findActiveByKey: jest.fn().mockResolvedValue({
      key: 'poa',
      label: 'Porto Alegre / RS',
      email: 'poa@djon.test',
    }),
  };
  const mailService = {
    sendNewSiteLead: jest.fn().mockResolvedValue(undefined),
  };
  const service = new LeadsService(
    leadModel as never,
    usersService as never,
    notificationsService as never,
    unitsService as never,
    mailService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('registra no portal e envia o mesmo contato ao e-mail da unidade', async () => {
    await expect(
      service.create({
        firstName: 'Ana',
        lastName: 'Silva',
        whatsapp: '51999990000',
        message: 'Quero conhecer o curso.',
        unitKey: 'poa',
      }),
    ).resolves.toEqual({ id: 'lead-1', received: true, emailSent: true });

    expect(unitsService.findActiveByKey).toHaveBeenCalledWith('poa');
    expect(mailService.sendNewSiteLead).toHaveBeenCalledWith({
      leadId: 'lead-1',
      unitEmail: 'poa@djon.test',
      unitName: 'Porto Alegre / RS',
      firstName: 'Ana',
      lastName: 'Silva',
      whatsapp: '51999990000',
      message: 'Quero conhecer o curso.',
    });
  });
});
