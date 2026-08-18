import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { MaterialsModule } from '../materials/materials.module';
import { UsersModule } from '../users/users.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [UsersModule, EventsModule, MaterialsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
