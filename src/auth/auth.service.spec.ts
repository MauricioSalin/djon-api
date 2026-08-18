import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../common/enums/role.enum';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('emite JWT com identidade e papel do usuário validado', async () => {
    const usersService = {
      validateCredentials: jest.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        name: 'Aluno Teste',
        email: 'aluno@teste.com',
        role: Role.Student,
        avatar: '',
      }),
    };
    const jwtService = { signAsync: jest.fn().mockResolvedValue('token-jwt') };
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    const service = module.get(AuthService);
    const result = await service.login({
      email: 'ALUNO@TESTE.COM',
      password: 'SenhaTeste@2026',
    });

    expect(usersService.validateCredentials).toHaveBeenCalledWith(
      'ALUNO@TESTE.COM',
      'SenhaTeste@2026',
    );
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: '507f1f77bcf86cd799439011',
      email: 'aluno@teste.com',
      role: Role.Student,
    });
    expect(result.accessToken).toBe('token-jwt');
    expect(result.user.role).toBe(Role.Student);
  });
});
