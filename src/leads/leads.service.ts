import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { Lead, LeadDocument, LeadStatus } from './schemas/lead.schema';

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateLeadDto) {
    const lead = await this.leadModel.create({
      ...dto,
      email: dto.email.toLowerCase().trim(),
    });
    const admins = await this.usersService.findActiveByRoles([Role.Admin]);
    await this.notificationsService.createForRecipients(
      admins.map((admin) => String(admin._id)),
      {
        type: 'lead.created',
        title: 'Novo contato pelo site',
        body: `${dto.firstName ?? 'Visitante'} — ${dto.email}`,
        url: '/dashboard/admin/leads',
        metadata: { leadId: String(lead.id) },
      },
    );
    return { id: String(lead.id), received: true };
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
