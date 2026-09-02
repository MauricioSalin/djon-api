import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditModule } from './audit/audit.module';
import { BookingsModule } from './bookings/bookings.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { validateEnvironment } from './config/env.validation';
import { EventsModule } from './events/events.module';
import { EquipmentsModule } from './equipments/equipments.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { LeadsModule } from './leads/leads.module';
import { MaterialsModule } from './materials/materials.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PortalContentModule } from './portal-content/portal-content.module';
import { LandingContentModule } from './landing-content/landing-content.module';
import { SearchModule } from './search/search.module';
import { UnitsModule } from './units/units.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        autoIndex: true,
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    UsersModule,
    AuditModule,
    AuthModule,
    UnitsModule,
    EquipmentsModule,
    NotificationsModule,
    PortalContentModule,
    LandingContentModule,
    BookingsModule,
    EventsModule,
    MaterialsModule,
    CoursesModule,
    FilesModule,
    LeadsModule,
    SearchModule,
    HealthModule,
    SyncModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
