import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.validateCredentials(
      dto.email,
      dto.password,
    );
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        unitId: user.unitId,
        passwordChangeRequired: user.passwordChangeRequired,
        permissions: user.permissions ?? [],
      },
    };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    await this.usersService.requestPasswordReset(dto.email);
    return {
      message:
        'Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    await this.usersService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Senha redefinida com sucesso.' };
  }
}
