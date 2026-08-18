import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UnitsModule } from '../units/units.module';
import { EquipmentsController } from './equipments.controller';
import { EquipmentsService } from './equipments.service';
import { Equipment, EquipmentSchema } from './schemas/equipment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Equipment.name, schema: EquipmentSchema },
    ]),
    UnitsModule,
  ],
  controllers: [EquipmentsController],
  providers: [EquipmentsService],
  exports: [EquipmentsService, MongooseModule],
})
export class EquipmentsModule {}
