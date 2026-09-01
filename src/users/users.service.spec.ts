import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { FilesService } from '../files/files.service';
import { UnitsService } from '../units/units.service';
import { UserDocument } from './schemas/user.schema';
import { UsersService } from './users.service';
import { MailService } from '../mail/mail.service';

describe('UsersService', () => {
  const password = 'SenhaTeste@2026';
  let service: UsersService;
  const unitsService = {
    findActiveById: jest.fn(),
  };
  const mailService = {
    sendTemporaryPassword: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(
      {} as Model<UserDocument>,
      {} as FilesService,
      unitsService as unknown as UnitsService,
      mailService as unknown as MailService,
    );
  });

  async function authenticationUser(active: boolean) {
    return {
      id: '507f1f77bcf86cd799439011',
      name: 'Aluno Teste',
      email: 'aluno@teste.com',
      role: Role.Student,
      active,
      passwordHash: await hash(password, 4),
    } as unknown as UserDocument;
  }

  it('autentica uma conta ativa com credenciais corretas', async () => {
    const user = await authenticationUser(true);
    jest.spyOn(service, 'findForAuthentication').mockResolvedValue(user);

    await expect(
      service.validateCredentials(user.email, password),
    ).resolves.toBe(user);
  });

  it('recusa uma conta desativada e explica como recuperar o acesso', async () => {
    const user = await authenticationUser(false);
    jest.spyOn(service, 'findForAuthentication').mockResolvedValue(user);

    await expect(
      service.validateCredentials(user.email, password),
    ).rejects.toThrow(
      new ForbiddenException(
        'Sua conta está desativada. Entre em contato com a administração para recuperar o acesso.',
      ),
    );
  });

  it('não revela que a conta está desativada quando a senha está errada', async () => {
    const user = await authenticationUser(false);
    jest.spyOn(service, 'findForAuthentication').mockResolvedValue(user);

    await expect(
      service.validateCredentials(user.email, 'SenhaIncorreta@2026'),
    ).rejects.toThrow(new UnauthorizedException('E-mail ou senha inválidos.'));
  });
  it('exige unidade ao cadastrar um professor', async () => {
    await expect(
      service.create({
        name: 'Professor sem unidade',
        email: 'professor@teste.com',
        password,
        role: Role.Professor,
      }),
    ).rejects.toThrow('Unidade é obrigatória para professores.');
  });

  it('exige unidade ao cadastrar um aluno', async () => {
    await expect(
      service.create({
        name: 'Aluno sem unidade',
        email: 'aluno.sem.unidade@teste.com',
        password,
        role: Role.Student,
      }),
    ).rejects.toThrow('Unidade é obrigatória para alunos.');
  });

  it('impede professor de cadastrar usuários que não sejam alunos', async () => {
    await expect(
      service.create(
        {
          name: 'Outro Professor',
          email: 'outro.professor@teste.com',
          password,
          role: Role.Professor,
          unitId: '507f1f77bcf86cd799439012',
        },
        {
          id: '507f1f77bcf86cd799439013',
          email: 'professor@teste.com',
          role: Role.Professor,
        },
      ),
    ).rejects.toThrow(
      new ForbiddenException('Professor só pode cadastrar alunos.'),
    );
    expect(unitsService.findActiveById).not.toHaveBeenCalled();
  });

  it('permite professor cadastrar um aluno', async () => {
    const unitId = '507f1f77bcf86cd799439012';
    unitsService.findActiveById.mockResolvedValue({ id: unitId });
    const populate = jest.fn().mockResolvedValue(undefined);
    const createdUser = {
      id: '507f1f77bcf86cd799439014',
      name: 'Aluno cadastrado pelo professor',
      email: 'novo.aluno@teste.com',
      populate,
      deleteOne: jest.fn(),
    } as unknown as UserDocument;
    const create = jest.fn().mockResolvedValue(createdUser);
    const userModel = {
      create,
    } as unknown as Model<UserDocument>;
    const professorService = new UsersService(
      userModel,
      {} as FilesService,
      unitsService as unknown as UnitsService,
      mailService as unknown as MailService,
    );

    await expect(
      professorService.create(
        {
          name: 'Aluno cadastrado pelo professor',
          email: 'novo.aluno@teste.com',
          password,
          role: Role.Student,
          unitId,
        },
        {
          id: '507f1f77bcf86cd799439013',
          email: 'professor@teste.com',
          role: Role.Professor,
        },
      ),
    ).resolves.toBe(createdUser);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Aluno cadastrado pelo professor',
        email: 'novo.aluno@teste.com',
        role: Role.Student,
        unitId,
        passwordChangeRequired: true,
      }),
    );
    expect(unitsService.findActiveById).toHaveBeenCalledWith(unitId);
    expect(populate).toHaveBeenCalledWith(
      'unitId',
      'key label shortLabel active timezone',
    );
    expect(mailService.sendTemporaryPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '507f1f77bcf86cd799439014',
        email: 'novo.aluno@teste.com',
        role: Role.Student,
      }),
    );
  });

  it('cria senha temporária e envia boas-vindas ao professor cadastrado por administrador', async () => {
    const unitId = '507f1f77bcf86cd799439012';
    unitsService.findActiveById.mockResolvedValue({ id: unitId });
    const createdUser = {
      id: '507f1f77bcf86cd799439015',
      name: 'Professor Novo',
      email: 'professor.novo@teste.com',
      populate: jest.fn(),
      deleteOne: jest.fn(),
    } as unknown as UserDocument;
    const create = jest.fn().mockResolvedValue(createdUser);
    const professorService = new UsersService(
      { create } as unknown as Model<UserDocument>,
      {} as FilesService,
      unitsService as unknown as UnitsService,
      mailService as unknown as MailService,
    );

    await professorService.create(
      {
        name: 'Professor Novo',
        email: 'professor.novo@teste.com',
        role: Role.Professor,
        unitId,
      },
      {
        id: '507f1f77bcf86cd799439010',
        email: 'admin@teste.com',
        role: Role.Admin,
      },
    );

    const createdCalls = create.mock.calls as unknown as [
      [
        {
          passwordChangeRequired: boolean;
          passwordHash: string;
        },
      ],
    ];
    const createdData = createdCalls[0][0];
    expect(createdData.passwordChangeRequired).toBe(true);
    expect(typeof createdData.passwordHash).toBe('string');
    const welcomeCalls = mailService.sendTemporaryPassword.mock
      .calls as unknown as [
      [
        {
          email: string;
          role: Role;
          temporaryPassword: string;
        },
      ],
    ];
    const welcomeData = welcomeCalls[0][0];
    expect(welcomeData.email).toBe('professor.novo@teste.com');
    expect(welcomeData.role).toBe(Role.Professor);
    expect(typeof welcomeData.temporaryPassword).toBe('string');
  });

  it('envia link de recuperação somente para conta ativa cadastrada', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const user = {
      id: '507f1f77bcf86cd799439011',
      name: 'Aluno Teste',
      email: 'aluno@teste.com',
      save,
    } as unknown as UserDocument;
    const userModel = {
      findOne: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(user) }),
    } as unknown as Model<UserDocument>;
    const resetService = new UsersService(
      userModel,
      {} as FilesService,
      unitsService as unknown as UnitsService,
      mailService as unknown as MailService,
    );

    await resetService.requestPasswordReset(' ALUNO@TESTE.COM ');

    const resetCalls = mailService.sendPasswordReset.mock.calls as unknown as [
      [
        {
          email: string;
          token: string;
        },
      ],
    ];
    const resetData = resetCalls[0][0];
    expect(resetData.email).toBe('aluno@teste.com');
    expect(typeof resetData.token).toBe('string');
    expect(user.passwordResetTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(user.passwordResetExpiresAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('aceita o token uma única vez e salva a nova senha', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const user = {
      passwordHash: 'hash-antigo',
      passwordChangeRequired: true,
      passwordResetTokenHash: 'hash-token',
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
      save,
    } as unknown as UserDocument;
    const select = jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue(user) });
    const userModel = {
      findOne: jest.fn().mockReturnValue({ select }),
    } as unknown as Model<UserDocument>;
    const resetService = new UsersService(
      userModel,
      {} as FilesService,
      unitsService as unknown as UnitsService,
      mailService as unknown as MailService,
    );

    await resetService.resetPassword('token-seguro', 'NovaSenha@2026');

    expect(user.passwordHash).not.toBe('hash-antigo');
    expect(user.passwordChangeRequired).toBe(false);
    expect(user.passwordResetTokenHash).toBeUndefined();
    expect(user.passwordResetExpiresAt).toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('exclui permanentemente um aluno sem histórico vinculado', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const deleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
    const collection = jest.fn().mockReturnValue({ findOne, deleteMany });
    const deleteOneExec = jest.fn().mockResolvedValue({ deletedCount: 1 });
    const userModel = {
      db: { collection },
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ role: Role.Student }),
      }),
      deleteOne: jest.fn().mockReturnValue({ exec: deleteOneExec }),
    } as unknown as Model<UserDocument>;
    const deleteService = new UsersService(
      userModel,
      {} as FilesService,
      unitsService as unknown as UnitsService,
      mailService as unknown as MailService,
    );

    await expect(
      deleteService.permanentlyDeleteUser('507f1f77bcf86cd799439014'),
    ).resolves.toEqual({
      id: '507f1f77bcf86cd799439014',
      deleted: true,
    });
    expect(findOne).toHaveBeenCalledTimes(8);
    expect(deleteMany).toHaveBeenCalledTimes(2);
    expect(deleteOneExec).toHaveBeenCalledTimes(1);
  });

  it('transfere todos os vínculos do professor para o Devito antes de excluir', async () => {
    const professorId = new Types.ObjectId('507f1f77bcf86cd799439014');
    const devitoId = new Types.ObjectId('507f1f77bcf86cd799439015');
    const bookingFind = jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue([
        {
          activeProfessorSlotKeys: [
            `unit:professor:${professorId.toHexString()}:2026-09-01:10:00`,
          ],
        },
      ]),
    });
    const bookingFindOne = jest.fn().mockResolvedValue(null);
    const bookingUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
    const collection = jest.fn((name: string) => {
      if (name === 'users') {
        return {
          findOne: jest.fn().mockResolvedValue({
            _id: devitoId,
            name: 'Devito',
            email: 'devito@djonacademy.com',
          }),
        };
      }
      if (name === 'bookings') {
        return {
          find: bookingFind,
          findOne: bookingFindOne,
          updateMany: bookingUpdateMany,
        };
      }
      return { updateMany, deleteMany };
    });
    const deleteOneExec = jest.fn().mockResolvedValue({ deletedCount: 1 });
    const userModel = {
      db: { collection },
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ role: Role.Professor }),
      }),
      deleteOne: jest.fn().mockReturnValue({ exec: deleteOneExec }),
    } as unknown as Model<UserDocument>;
    const deleteService = new UsersService(
      userModel,
      {} as FilesService,
      unitsService as unknown as UnitsService,
      mailService as unknown as MailService,
    );

    await expect(
      deleteService.permanentlyDeleteUser(professorId.toHexString()),
    ).resolves.toEqual({
      id: professorId.toHexString(),
      deleted: true,
      reassignedTo: devitoId.toHexString(),
    });
    expect(bookingFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ professorId: devitoId }),
      { projection: { _id: 1 } },
    );
    expect(bookingUpdateMany).toHaveBeenCalledWith(
      { professorId },
      expect.any(Array),
    );
    expect(bookingUpdateMany).toHaveBeenCalledWith(
      { requestedBy: professorId },
      { $set: { requestedBy: devitoId } },
    );
    expect(collection).toHaveBeenCalledWith('cohorts');
    expect(collection).toHaveBeenCalledWith('lessons');
    expect(collection).toHaveBeenCalledWith('events');
    expect(collection).toHaveBeenCalledWith('materials');
    expect(collection).toHaveBeenCalledWith('courses');
    expect(collection).toHaveBeenCalledWith('storedfiles');
    expect(collection).toHaveBeenCalledWith('leads');
    expect(collection).toHaveBeenCalledWith('auditlogs');
    expect(deleteMany).toHaveBeenCalledTimes(2);
    expect(deleteOneExec).toHaveBeenCalledTimes(1);
  });

  it('preserva aluno que possui histórico vinculado', async () => {
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({ _id: 'booking-id' })
      .mockResolvedValue(null);
    const deleteMany = jest.fn();
    const collection = jest.fn().mockReturnValue({ findOne, deleteMany });
    const deleteOne = jest.fn();
    const userModel = {
      db: { collection },
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ role: Role.Student }),
      }),
      deleteOne,
    } as unknown as Model<UserDocument>;
    const deleteService = new UsersService(
      userModel,
      {} as FilesService,
      unitsService as unknown as UnitsService,
      mailService as unknown as MailService,
    );

    await expect(
      deleteService.permanentlyDeleteUser('507f1f77bcf86cd799439014'),
    ).rejects.toThrow(
      new BadRequestException(
        'Este usuário possui histórico vinculado e não pode ser excluído. Desative o acesso para preservar os registros.',
      ),
    );
    expect(deleteMany).not.toHaveBeenCalled();
    expect(deleteOne).not.toHaveBeenCalled();
  });
});
