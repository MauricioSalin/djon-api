import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { Model } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { FilesService } from '../files/files.service';
import { UnitsService } from '../units/units.service';
import { UserDocument } from './schemas/user.schema';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const password = 'SenhaTeste@2026';
  let service: UsersService;
  const unitsService = {
    findActiveById: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(
      {} as Model<UserDocument>,
      {} as FilesService,
      unitsService as unknown as UnitsService,
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
      populate,
    } as unknown as UserDocument;
    const create = jest.fn().mockResolvedValue(createdUser);
    const userModel = {
      create,
    } as unknown as Model<UserDocument>;
    const professorService = new UsersService(
      userModel,
      {} as FilesService,
      unitsService as unknown as UnitsService,
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
      }),
    );
    expect(unitsService.findActiveById).toHaveBeenCalledWith(unitId);
    expect(populate).toHaveBeenCalledWith(
      'unitId',
      'key label shortLabel active',
    );
  });
});
