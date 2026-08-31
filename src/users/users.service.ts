import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { compare, hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { Permission } from '../common/enums/permission.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { actorHasPermission } from '../common/permissions';
import { FilesService } from '../files/files.service';
import { UnitsService } from '../units/units.service';
import { MailService } from '../mail/mail.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly filesService: FilesService,
    private readonly unitsService: UnitsService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateUserDto, actor?: AuthUser): Promise<UserDocument> {
    const delegatedUserManager = actorHasPermission(
      actor,
      Permission.UsersManage,
    );
    if (actor?.role === Role.Professor && dto.role === Role.Admin) {
      throw new ForbiddenException(
        'Somente administradores podem cadastrar administradores.',
      );
    }
    if (
      actor?.role === Role.Professor &&
      !delegatedUserManager &&
      dto.role !== Role.Student
    ) {
      throw new ForbiddenException('Professor só pode cadastrar alunos.');
    }
    if (!dto.password && !(actor && dto.role === Role.Student)) {
      throw new BadRequestException('Senha é obrigatória para este usuário.');
    }
    await this.validateManagedUserUnit(dto.role, dto.unitId);
    const temporaryPassword = dto.password ?? this.generateTemporaryPassword();
    try {
      const user = await this.userModel.create({
        ...dto,
        trainingHoursLimit:
          dto.role === Role.Student
            ? (dto.trainingHoursLimit ?? 15)
            : undefined,
        email: dto.email.toLowerCase().trim(),
        passwordHash: await hash(temporaryPassword, 12),
        passwordChangeRequired: Boolean(actor && dto.role === Role.Student),
      });
      if (actor && dto.role === Role.Student) {
        try {
          await this.mailService.sendTemporaryPassword({
            userId: String(user.id),
            name: user.name,
            email: user.email,
            temporaryPassword,
          });
        } catch (error) {
          await user.deleteOne();
          throw error;
        }
      }
      await user.populate('unitId', 'key label shortLabel active timezone');
      return user;
    } catch (error: unknown) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  async findAll(query: QueryUsersDto, actor?: AuthUser) {
    const filter: Record<string, unknown> = {};
    const canManageUsers =
      actor?.role === Role.Admin ||
      actor?.permissions?.includes(Permission.UsersManage);
    if (!(canManageUsers && query.includeInactive)) {
      filter.active = true;
    }
    if (actor?.role === Role.Student) {
      if (query.role && query.role !== Role.Professor) {
        throw new ForbiddenException(
          'Aluno só pode consultar o diretório de professores.',
        );
      }
      filter.role = Role.Professor;
    }
    if (query.role) filter.role = query.role;
    if (query.search?.trim()) {
      const escaped = query.search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { projectName: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { whatsapp: { $regex: escaped, $options: 'i' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select(
          canManageUsers
            ? '-passwordHash +cpf +trainingHoursLimit +permissions'
            : '-passwordHash -cpf -trainingHoursLimit',
        )
        .populate('unitId', 'key label shortLabel active')
        .sort({ name: 1 })
        .skip(skip)
        .limit(query.limit)
        .lean({ virtuals: true })
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string, actor: AuthUser) {
    this.ensureObjectId(id);
    const includePrivate =
      actor.id === id || actorHasPermission(actor, Permission.UsersManage);
    const query = this.userModel.findById(id).select('-passwordHash');
    if (includePrivate) query.select('+cpf +trainingHoursLimit');
    query.populate('unitId', 'key label shortLabel active');
    const user = await query.lean({ virtuals: true }).exec();
    if (!user || !user.active)
      throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  async findMe(id: string) {
    this.ensureObjectId(id);
    const user = await this.userModel
      .findById(id)
      .select('+cpf +trainingHoursLimit +permissions')
      .populate('unitId', 'key label shortLabel active')
      .lean({ virtuals: true })
      .exec();
    if (!user || !user.active)
      throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  async updateMe(id: string, dto: UpdateMeDto) {
    return this.updateDocument(id, { ...dto }, '+cpf');
  }

  async changePassword(id: string, dto: ChangePasswordDto) {
    this.ensureObjectId(id);
    const user = await this.userModel
      .findById(id)
      .select('+passwordHash')
      .exec();
    if (!user || !user.active)
      throw new NotFoundException('Usuário não encontrado.');
    if (!(await compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Senha atual inválida.');
    }
    user.passwordHash = await hash(dto.newPassword, 12);
    user.passwordChangeRequired = false;
    await user.save();
    return { changed: true };
  }

  async updateByManager(id: string, dto: UpdateUserDto, actor: AuthUser) {
    this.ensureObjectId(id);
    const target = await this.userModel.findById(id).exec();
    if (!target || !target.active)
      throw new NotFoundException('Usuário não encontrado.');
    const delegatedUserManager = actorHasPermission(
      actor,
      Permission.UsersManage,
    );
    if (actor.role === Role.Professor && target.role === Role.Admin) {
      throw new ForbiddenException(
        'Somente administradores podem editar administradores.',
      );
    }
    if (
      actor.role === Role.Professor &&
      !delegatedUserManager &&
      target.role !== Role.Student
    ) {
      throw new ForbiddenException(
        'Professor só pode editar perfis de alunos.',
      );
    }

    const targetRole = dto.role ?? target.role;
    if (actor.role === Role.Professor && targetRole === Role.Admin) {
      throw new ForbiddenException(
        'Somente administradores podem atribuir a função de administrador.',
      );
    }
    await this.validateManagedUserUnit(
      targetRole,
      dto.unitId ?? target.unitId?.toString(),
    );

    const update: Record<string, unknown> = { ...dto };
    delete update.password;
    if (dto.password) update.passwordHash = await hash(dto.password, 12);
    if (actor.role === Role.Professor && !delegatedUserManager) {
      const allowed = ['name', 'projectName', 'email', 'whatsapp', 'unitId'];
      Object.keys(update).forEach((key) => {
        if (!allowed.includes(key)) delete update[key];
      });
    }
    return this.updateDocument(
      id,
      update,
      actor.role === Role.Admin ? '+cpf +trainingHoursLimit' : '+cpf',
    );
  }

  async deactivate(id: string, actor: AuthUser) {
    if (id === actor.id) {
      throw new ForbiddenException('Não é possível desativar a própria conta.');
    }
    this.ensureObjectId(id);
    const target = await this.userModel.findById(id).exec();
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    if (actor.role !== Role.Admin && target.role === Role.Admin) {
      throw new ForbiddenException(
        'Somente administradores podem desativar administradores.',
      );
    }
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        { active: false, deactivatedAt: new Date() },
        { returnDocument: 'after' },
      )
      .exec();
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return { id, active: false };
  }

  async restore(id: string, actor: AuthUser) {
    this.ensureObjectId(id);
    const target = await this.userModel.findById(id).exec();
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    if (actor.role !== Role.Admin && target.role === Role.Admin) {
      throw new ForbiddenException(
        'Somente administradores podem restaurar administradores.',
      );
    }
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        { active: true, $unset: { deactivatedAt: 1 } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  async updatePermissions(id: string, permissions: Permission[]) {
    this.ensureObjectId(id);
    const user = await this.userModel
      .findOneAndUpdate(
        { _id: id, role: Role.Professor },
        { permissions },
        { returnDocument: 'after', runValidators: true },
      )
      .select('+permissions')
      .populate('unitId', 'key label shortLabel active timezone')
      .exec();
    if (!user) {
      throw new BadRequestException(
        'Privilégios extras só podem ser atribuídos a professores.',
      );
    }
    return user;
  }

  async findForAuthentication(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase().trim() })
      .select('+passwordHash +permissions')
      .exec();
  }

  async validateCredentials(
    email: string,
    password: string,
  ): Promise<UserDocument> {
    const user = await this.findForAuthentication(email);
    if (!user || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }
    if (!user.active) {
      throw new ForbiddenException(
        'Sua conta está desativada. Entre em contato com a administração para recuperar o acesso.',
      );
    }
    return user;
  }

  async findActiveAuthUser(id: string): Promise<AuthUser> {
    this.ensureObjectId(id);
    const user = await this.userModel
      .findOne({ _id: id, active: true })
      .select('email role unitId +permissions')
      .lean()
      .exec();
    if (!user) throw new UnauthorizedException('Sessão sem usuário ativo.');
    return {
      id,
      email: user.email,
      role: user.role,
      unitId: user.unitId?.toString(),
      permissions: user.permissions ?? [],
    };
  }

  async findActiveByRoles(roles: Role[]) {
    return this.userModel
      .find({ active: true, role: { $in: roles } })
      .select('_id email name role')
      .lean()
      .exec();
  }

  async findActiveReviewers() {
    return this.userModel
      .find({
        active: true,
        $or: [
          { role: Role.Admin },
          {
            role: Role.Professor,
            permissions: Permission.BookingsReview,
          },
        ],
      })
      .select('_id email name role')
      .lean()
      .exec();
  }

  async findActiveByRole(id: string, role: Role) {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.userModel
      .findOne({ _id: id, active: true, role })
      .select('_id email name role unitId +trainingHoursLimit')
      .lean()
      .exec();
  }

  async findByLegacyId(legacyId: string) {
    return this.userModel.findOne({ legacyId }).exec();
  }

  private async updateDocument(
    id: string,
    update: Record<string, unknown>,
    select = '',
  ) {
    this.ensureObjectId(id);
    try {
      const previous = await this.userModel
        .findById(id)
        .select('avatar banner latestRelease.cover')
        .lean()
        .exec();
      const user = await this.userModel
        .findByIdAndUpdate(
          id,
          {
            ...update,
            ...(typeof update.email === 'string'
              ? { email: update.email.toLowerCase().trim() }
              : {}),
          },
          { returnDocument: 'after', runValidators: true },
        )
        .select(`-passwordHash ${select}`)
        .populate('unitId', 'key label shortLabel active')
        .exec();
      if (!user) throw new NotFoundException('Usuário não encontrado.');
      const previousFileIds = this.filesService.extractFileIds([
        previous?.avatar,
        previous?.banner,
        previous?.latestRelease?.cover,
      ]);
      const currentFileIds = this.filesService.extractFileIds([
        user.avatar,
        user.banner,
        user.latestRelease?.cover,
      ]);
      await this.filesService.removeFileIds(
        [...previousFileIds].filter((fileId) => !currentFileIds.has(fileId)),
      );
      return user;
    } catch (error: unknown) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  private ensureObjectId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Usuário não encontrado.');
    }
  }

  private async validateManagedUserUnit(role: Role, unitId?: string) {
    if (role === Role.Professor && !unitId) {
      throw new BadRequestException('Unidade é obrigatória para professores.');
    }
    if (role === Role.Student && !unitId) {
      throw new BadRequestException('Unidade é obrigatória para alunos.');
    }
    if (!unitId) return;
    const unit = await this.unitsService.findActiveById(unitId);
    if (!unit) {
      throw new BadRequestException('A unidade selecionada não está ativa.');
    }
  }

  private handleDuplicate(error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ConflictException(
        'E-mail, CPF ou identificador já cadastrado.',
      );
    }
  }

  private generateTemporaryPassword() {
    return `DjOn!${randomBytes(7).toString('base64url')}9a`;
  }
}
