import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export interface AuditEntry {
  actorId?: string;
  actorRole?: Role;
  actorName?: string;
  actorEmail?: string;
  method: string;
  path: string;
  statusCode: number;
  targetId?: string;
  ip?: string;
  userAgent?: string;
  requestBody?: unknown;
  durationMs: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
  ) {}

  record(entry: AuditEntry) {
    return this.auditModel.create({
      ...entry,
      actorId: entry.actorId ? new Types.ObjectId(entry.actorId) : undefined,
    });
  }

  async findAll(page = 1, limit = 50, actorId?: string, method?: string) {
    const filter: Record<string, unknown> = {};
    if (actorId) filter.actorId = new Types.ObjectId(actorId);
    if (method) filter.method = method.toUpperCase();
    const [items, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .populate('actorId', 'name email role')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.auditModel.countDocuments(filter).exec(),
    ]);
    return { items, total, page, limit };
  }
}
