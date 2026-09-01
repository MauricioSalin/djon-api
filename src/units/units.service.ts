import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UpsertUnitDto } from './dto/upsert-unit.dto';
import { Unit, UnitDocument } from './schemas/unit.schema';
import { generateUnitMapLinks } from './unit-map-links';

@Injectable()
export class UnitsService {
  constructor(
    @InjectModel(Unit.name) private readonly unitModel: Model<UnitDocument>,
  ) {}

  findAll(activeOnly = true) {
    return this.unitModel
      .find(activeOnly ? { active: true } : {})
      .sort({ label: 1 })
      .lean({ virtuals: true });
  }

  async create(dto: UpsertUnitDto) {
    try {
      const mapLinks = await this.generateMapLinks(dto.address);
      return await this.unitModel.create({
        ...dto,
        key: dto.key.toLowerCase().trim(),
        ...mapLinks,
      });
    } catch (error: unknown) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  async update(id: string, dto: UpsertUnitDto) {
    try {
      const current = await this.unitModel.findById(id).lean().exec();
      if (!current) throw new NotFoundException('Unidade não encontrada.');
      const addressChanged = current.address.trim() !== dto.address.trim();
      const mapLinks =
        addressChanged || !current.mapSrc || !current.mapsHref
          ? await this.generateMapLinks(dto.address)
          : { mapSrc: current.mapSrc, mapsHref: current.mapsHref };
      const unit = await this.unitModel.findByIdAndUpdate(
        id,
        { ...dto, key: dto.key.toLowerCase().trim(), ...mapLinks },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      );
      if (!unit) throw new NotFoundException('Unidade não encontrada.');
      return unit;
    } catch (error: unknown) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  async deactivate(id: string) {
    const unit = await this.unitModel.findByIdAndUpdate(
      id,
      { active: false },
      { returnDocument: 'after' },
    );
    if (!unit) throw new NotFoundException('Unidade não encontrada.');
    return unit;
  }

  async findDefault() {
    return this.unitModel.findOne({ key: 'poa', active: true }).exec();
  }

  async findActiveById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.unitModel.findOne({ _id: id, active: true }).lean().exec();
  }

  async findActiveByKey(key?: string) {
    if (!key?.trim()) return this.findDefault();
    return this.unitModel
      .findOne({ key: key.toLowerCase().trim(), active: true })
      .exec();
  }

  private handleDuplicate(error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ConflictException('Identificador de unidade já cadastrado.');
    }
  }

  private async generateMapLinks(address: string) {
    try {
      return await generateUnitMapLinks(address);
    } catch {
      throw new UnprocessableEntityException(
        'Não foi possível localizar o endereço. Revise-o e tente novamente.',
      );
    }
  }
}
