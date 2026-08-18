import { Injectable } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { MaterialsService } from '../materials/materials.service';
import { MaterialStatus } from '../materials/schemas/material.schema';
import { UsersService } from '../users/users.service';
import { AuthUser } from '../common/interfaces/auth-user.interface';

@Injectable()
export class SearchService {
  constructor(
    private readonly usersService: UsersService,
    private readonly eventsService: EventsService,
    private readonly materialsService: MaterialsService,
  ) {}

  async search(query: string, actor: AuthUser) {
    const normalized = query.trim();
    if (normalized.length < 2) {
      return { users: [], events: [], materials: [] };
    }
    const [users, events, materials] = await Promise.all([
      this.usersService.findAll(
        {
          search: normalized,
          page: 1,
          limit: 5,
        },
        actor,
      ),
      this.eventsService.findAll({
        search: normalized,
        page: 1,
        limit: 5,
      }),
      this.materialsService.findAll(
        {
          search: normalized,
          page: 1,
          limit: 5,
        },
        actor,
      ),
    ]);
    return {
      users: users.items,
      events: events.items,
      materials: materials.items.filter(
        (material) => material.status !== MaterialStatus.Draft,
      ),
    };
  }
}
