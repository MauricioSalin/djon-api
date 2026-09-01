import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { UnitsService } from '../units/units.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { Lead, LeadDocument, LeadStatus } from './schemas/lead.schema';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly unitsService: UnitsService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateLeadDto) {
    const lead = await this.leadModel.create({
      ...dto,
      whatsapp: dto.whatsapp.replace(/\D/g, ''),
      ...(dto.email ? { email: dto.email.toLowerCase().trim() } : {}),
    });
    const admins = await this.usersService.findActiveByRoles([Role.Admin]);
    await this.notificationsService.createForRecipients(
      admins.map((admin) => String(admin._id)),
      {
        type: 'lead.created',
        title: 'Novo contato pelo site',
        body: `${dto.firstName ?? 'Visitante'} — ${dto.whatsapp}`,
        url: '/dashboard/admin/leads',
        metadata: { leadId: String(lead.id) },
      },
    );
    const unit = await this.unitsService.findActiveByKey(dto.unitKey);
    let emailSent = false;
    if (unit?.email) {
      try {
        await this.mailService.sendNewSiteLead({
          leadId: String(lead.id),
          unitEmail: unit.email,
          unitName: unit.label,
          firstName: dto.firstName,
          lastName: dto.lastName,
          whatsapp: dto.whatsapp,
          message: dto.message,
        });
        emailSent = true;
      } catch (error) {
        this.logger.error(
          `Contato ${String(lead.id)} salvo, mas o e-mail da unidade não foi enviado.`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    return { id: String(lead.id), received: true, emailSent };
  }

  findAll(status?: LeadStatus) {
    return this.leadModel
      .find(status ? { status } : {})
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .lean({ virtuals: true });
  }

  async update(id: string, dto: UpdateLeadDto) {
    const lead = await this.leadModel.findByIdAndUpdate(
      id,
      {
        ...dto,
        ...(dto.assignedTo
          ? { assignedTo: new Types.ObjectId(dto.assignedTo) }
          : {}),
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!lead) throw new NotFoundException('Contato não encontrado.');
    return lead;
  }

  async remove(id: string) {
    const result = await this.leadModel.deleteOne({ _id: id });
    if (!result.deletedCount)
      throw new NotFoundException('Contato não encontrado.');
    return { id, removed: true };
  }
}
