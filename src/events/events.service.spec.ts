import { Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { EventsService } from './events.service';
import { EventType } from './schemas/event.schema';

describe('EventsService - notificações', () => {
  const eventId = new Types.ObjectId();
  const studentId = new Types.ObjectId();
  const professorId = new Types.ObjectId();
  const eventModel = {
    create: jest.fn(),
  };
  const usersService = {
    findActiveByRoles: jest.fn(),
  };
  const notificationsService = {
    createForRecipients: jest.fn(),
  };
  const service = new EventsService(
    eventModel as never,
    usersService as never,
    notificationsService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    eventModel.create.mockResolvedValue({
      id: eventId.toString(),
      title: 'Open Decks DJ ON',
      date: '2026-09-20',
      time: '19:00',
    });
    usersService.findActiveByRoles.mockResolvedValue([
      { _id: studentId },
      { _id: professorId },
    ]);
    jest.spyOn(service, 'findOne').mockResolvedValue({} as never);
  });

  it('notifica alunos e professores quando a escola publica um evento', async () => {
    await service.create(
      {
        title: 'Open Decks DJ ON',
        date: '2026-09-20',
        time: '19:00',
        type: EventType.DjOn,
      },
      {
        id: new Types.ObjectId().toString(),
        email: 'admin@teste.com',
        role: Role.Admin,
      },
    );

    expect(usersService.findActiveByRoles).toHaveBeenCalledWith([
      Role.Student,
      Role.Professor,
    ]);
    expect(notificationsService.createForRecipients).toHaveBeenCalledWith(
      [studentId.toString(), professorId.toString()],
      expect.objectContaining({
        type: 'event.published',
        title: 'Novo evento oficial DJ ON',
      }),
    );
  });
});
