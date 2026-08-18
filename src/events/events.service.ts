import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { CreateEventDto } from './dto/create-event.dto';
import { QueryEventsDto } from './dto/query-events.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { Event, EventDocument, EventType } from './schemas/event.schema';

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateEventDto, actor: AuthUser) {
    const type =
      actor.role === Role.Admin
        ? (dto.type ?? EventType.DjOn)
        : actor.role === Role.Professor
          ? EventType.Professor
          : EventType.Student;
    const event = await this.eventModel.create({
      ...dto,
      instagram: this.normalizeHandle(dto.instagram),
      authorId: new Types.ObjectId(actor.id),
      type,
    });

    if (type === EventType.DjOn) {
      const recipients = await this.usersService.findActiveByRoles([
        Role.Student,
        Role.Professor,
      ]);
      await this.notificationsService.createForRecipients(
        recipients.map((recipient) => String(recipient._id)),
        {
          type: 'event.published',
          title: 'Novo evento oficial DJ ON',
          body: `${event.title} em ${event.date} às ${event.time}.`,
          url: '/dashboard/mural',
          metadata: { eventId: String(event.id) },
        },
      );
    }
    return this.findOne(String(event.id));
  }

  async findAll(query: QueryEventsDto) {
    const filter: Record<string, unknown> = {};
    if (query.type) filter.type = query.type;
    if (query.authorId) filter.authorId = new Types.ObjectId(query.authorId);
    if (query.search?.trim()) filter.$text = { $search: query.search.trim() };
    if (query.dateFrom || query.dateTo) {
      filter.date = {
        ...(query.dateFrom ? { $gte: query.dateFrom } : {}),
        ...(query.dateTo ? { $lte: query.dateTo } : {}),
      };
    }
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.eventModel
        .find(filter)
        .populate('authorId', 'name avatar role socials')
        .sort({ date: 1, time: 1 })
        .skip(skip)
        .limit(query.limit)
        .lean({ virtuals: true })
        .exec(),
      this.eventModel.countDocuments(filter).exec(),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string) {
    const event = await this.eventModel
      .findById(id)
      .populate('authorId', 'name avatar role socials')
      .lean({ virtuals: true })
      .exec();
    if (!event) throw new NotFoundException('Evento não encontrado.');
    return event;
  }

  async update(id: string, dto: UpdateEventDto, actor: AuthUser) {
    const event = await this.getOwned(id, actor);
    const update: Record<string, unknown> = {
      ...dto,
      instagram: this.normalizeHandle(dto.instagram),
    };
    if (actor.role !== Role.Admin) delete update.type;
    Object.assign(event, update);
    await event.save();
    return this.findOne(id);
  }

  async remove(id: string, actor: AuthUser) {
    const event = await this.getOwned(id, actor);
    await event.deleteOne();
    return { id, removed: true };
  }

  private async getOwned(id: string, actor: AuthUser) {
    const event = await this.eventModel.findById(id).exec();
    if (!event) throw new NotFoundException('Evento não encontrado.');
    if (actor.role !== Role.Admin && String(event.authorId) !== actor.id) {
      throw new ForbiddenException('Evento pertence a outro usuário.');
    }
    return event;
  }

  private normalizeHandle(value?: string) {
    return value?.trim().replace(/^@/, '') || undefined;
  }
}
