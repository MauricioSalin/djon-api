import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UnitsService } from '../units/units.service';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';
import { Equipment, EquipmentDocument } from './schemas/equipment.schema';

@Injectable()
export class EquipmentsService {
  constructor(
    @InjectModel(Equipment.name)
    private readonly equipmentModel: Model<EquipmentDocument>,
    private readonly unitsService: UnitsService,
  ) {}

  findAll(activeOnly = true) {
    return this.equipmentModel
      .find(activeOnly ? { active: true } : {})
      .populate('unitId', 'key label shortLabel active')
      .sort({ name: 1 })
      .lean({ virtuals: true })
      .exec();
  }

  async create(dto: CreateEquipmentDto) {
    await this.ensureActiveUnit(dto.unitId);
    try {
      const equipment = await this.equipmentModel.create({
        ...dto,
        name: dto.name.trim(),
        description: dto.description?.trim() || undefined,
        unitId: new Types.ObjectId(dto.unitId),
      });
      return this.findOne(String(equipment.id), false);
    } catch (error: unknown) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateEquipmentDto) {
    this.ensureObjectId(id);
    if (dto.unitId) await this.ensureActiveUnit(dto.unitId);
    try {
      const equipment = await this.equipmentModel.findByIdAndUpdate(
        id,
        {
          ...dto,
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || undefined }
            : {}),
          ...(dto.unitId ? { unitId: new Types.ObjectId(dto.unitId) } : {}),
        },
        { returnDocument: 'after', runValidators: true },
      );
      if (!equipment)
        throw new NotFoundException('Equipamento não encontrado.');
      return this.findOne(id, false);
    } catch (error: unknown) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  async deactivate(id: string) {
    this.ensureObjectId(id);
    const equipment = await this.equipmentModel.findByIdAndUpdate(
      id,
      { active: false },
      { returnDocument: 'after' },
    );
    if (!equipment) throw new NotFoundException('Equipamento não encontrado.');
    return equipment;
  }

  async findActiveById(id: string) {
    return this.findOne(id, true);
  }

  private async findOne(id: string, activeOnly: boolean) {
    this.ensureObjectId(id);
    const equipment = await this.equipmentModel
      .findOne({ _id: id, ...(activeOnly ? { active: true } : {}) })
      .populate('unitId', 'key label shortLabel active')
      .lean({ virtuals: true })
      .exec();
    if (!equipment)
      throw new NotFoundException('Equipamento não encontrado ou inativo.');
    return equipment;
  }

  private async ensureActiveUnit(id: string) {
    const unit = await this.unitsService.findActiveById(id);
    if (!unit)
      throw new BadRequestException('A unidade informada não está ativa.');
  }

  private ensureObjectId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Equipamento não encontrado.');
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
        'Já existe um equipamento com esse nome na unidade.',
      );
    }
  }
}
