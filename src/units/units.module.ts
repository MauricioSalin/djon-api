import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Unit, UnitSchema } from './schemas/unit.schema';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Unit.name, schema: UnitSchema }]),
  ],
  controllers: [UnitsController],
  providers: [UnitsService],
  exports: [UnitsService, MongooseModule],
})
export class UnitsModule {}
