import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { AuthService } from '../src/auth/auth.service';
import { BookingType } from '../src/bookings/schemas/booking.schema';
import { Role } from '../src/common/enums/role.enum';
import { Permission } from '../src/common/enums/permission.enum';
import { configureApp } from '../src/configure-app';
import { EventType } from '../src/events/schemas/event.schema';
import { EquipmentsService } from '../src/equipments/equipments.service';
import { UnitsService } from '../src/units/units.service';
import { UsersService } from '../src/users/users.service';
import { MailService } from '../src/mail/mail.service';

describe('DJ ON API (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;
  let mongoServer: MongoMemoryServer;
  const password = 'SenhaTeste@2026';
  const futureDate = (offset: number) => {
    const value = new Date();
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const trainingDate = futureDate(2);
  const originalTrainingDate = futureDate(3);
  const rescheduledTrainingDate = futureDate(4);
  const tokens: Partial<Record<Role, string>> = {};
  let secondStudentToken: string;
  let managedStudentToken: string;
  let managedStudentId: string;
  let bookingId: string;
  let eventId: string;
  let categoryId: string;
  let materialId: string;
  let leadId: string;
  let unitId: string;
  let professorId: string;
  let equipmentId: string;
  let loginIpOctet = 10;

  beforeAll(async () => {
    const databaseName = `djon_e2e_${Date.now()}`;
    mongoServer = await MongoMemoryServer.create({
      instance: { dbName: databaseName },
    });
    process.env.MONGODB_URI = mongoServer.getUri(databaseName);
    process.env.JWT_SECRET = 'e2e-secret-with-at-least-32-characters';
    process.env.JWT_EXPIRES_IN_SECONDS = '3600';
    process.env.API_PREFIX = 'api/v1';
    process.env.SEED_DEFAULT_PASSWORD = password;
    process.env.AUDIT_ALLOWED_EMAILS = 'admin@teste.com';

    const { AppModule } =
      jest.requireActual<typeof import('../src/app.module')>(
        '../src/app.module',
      );
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailService)
      .useValue({
        sendTemporaryPassword: jest.fn().mockResolvedValue(undefined),
      })
      .compile();
    app = module.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    configureApp(app);
    await app.init();
    connection = app.get<Connection>(getConnectionToken());

    if (!connection.name.startsWith('djon_e2e_')) {
      throw new Error(`Banco E2E inseguro: ${connection.name}`);
    }

    const unit = await app.get(UnitsService).create({
      key: 'poa',
      label: 'Porto Alegre / RS',
      shortLabel: 'POA',
      address: 'Unidade de teste',
    });
    unitId = String(unit.id);

    const users = app.get(UsersService);
    await users.create({
      name: 'Admin Teste',
      email: 'admin@teste.com',
      password,
      role: Role.Admin,
    });
    const professor = await users.create({
      name: 'Professor Teste',
      email: 'professor@teste.com',
      password,
      role: Role.Professor,
      unitId,
    });
    professorId = String(professor.id);
    await users.create({
      name: 'Aluno Um',
      email: 'aluno1@teste.com',
      password,
      role: Role.Student,
      unitId,
      trainingHoursLimit: 8,
    });
    await users.create({
      name: 'Aluno Dois',
      email: 'aluno2@teste.com',
      password,
      role: Role.Student,
      unitId,
    });
    const equipment = await app.get(EquipmentsService).create({
      name: 'CDJ E2E',
      description: 'Setup usado nos testes automatizados.',
      unitId,
    });
    equipmentId = String(equipment._id);

    for (const [role, email] of [
      [Role.Admin, 'admin@teste.com'],
      [Role.Professor, 'professor@teste.com'],
      [Role.Student, 'aluno1@teste.com'],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `127.0.0.${loginIpOctet++}`)
        .send({ email, password })
        .expect(201);
      tokens[role] = response.body.accessToken as string;
    }
    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `127.0.0.${loginIpOctet++}`)
      .send({ email: 'aluno2@teste.com', password })
      .expect(201);
    secondStudentToken = second.body.accessToken as string;
  }, 120_000);

  afterAll(async () => {
    if (connection?.name.startsWith('djon_e2e_')) {
      await connection.dropDatabase();
    }
    await app?.close();
    await mongoServer?.stop();
  });

  it('expõe health e recebe lead sem autenticação', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('ok'));
    const lead = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({
        firstName: 'Visitante',
        whatsapp: '51999231401',
        message: 'Quero conhecer o curso.',
        unitKey: 'poa',
      })
      .expect(201)
      .expect(({ body }) => expect(body.received).toBe(true));
    leadId = String(lead.body.id);
  });

  it('permite ao administrador tratar o contato recebido', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/leads')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: leadId,
              whatsapp: '51999231401',
              unitKey: 'poa',
            }),
          ]),
        );
      });
    await request(app.getHttpServer())
      .patch(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ status: 'contatado', internalNotes: 'Contato validado no E2E.' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('contatado'));
    await request(app.getHttpServer())
      .delete(`/api/v1/leads/${leadId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) => expect(body.removed).toBe(true));
  });

  it('protege rotas e aplica RBAC', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBe(1);
        expect(body.items[0].role).toBe(Role.Professor);
      });
    await request(app.getHttpServer())
      .get('/api/v1/users?role=student')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/users?role=student')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) => expect(body.total).toBe(2));

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        name: 'Sem Senha',
        email: 'sem-senha@teste.com',
        role: Role.Student,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        name: 'Aluno sem unidade',
        email: 'aluno-sem-unidade@teste.com',
        password,
        role: Role.Student,
      })
      .expect(400)
      .expect(({ body }) =>
        expect(body.message).toBe('Unidade é obrigatória para alunos.'),
      );
  });

  it('aplica e revoga todos os privilégios delegados sem novo login', async () => {
    const allPermissions = Object.values(Permission);
    const missingId = '507f1f77bcf86cd799439099';
    const professorToken = tokens[Role.Professor];
    const adminToken = tokens[Role.Admin];
    const permissionTarget = await app.get(UsersService).create({
      name: 'Professor Alvo de Permissões',
      email: 'professor-permissoes@teste.com',
      password,
      role: Role.Professor,
      unitId,
    });
    const permissionTargetId = String(permissionTarget.id);

    const expectDenied = async () => {
      const checks = [
        () =>
          request(app.getHttpServer())
            .get('/api/v1/leads')
            .set('Authorization', `Bearer ${professorToken}`)
            .expect(403),
        () =>
          request(app.getHttpServer())
            .get('/api/v1/units/admin/all')
            .set('Authorization', `Bearer ${professorToken}`)
            .expect(403),
        () =>
          request(app.getHttpServer())
            .get('/api/v1/equipments/admin/all')
            .set('Authorization', `Bearer ${professorToken}`)
            .expect(403),
        () =>
          request(app.getHttpServer())
            .get('/api/v1/audit-logs')
            .set('Authorization', `Bearer ${professorToken}`)
            .expect(403),
        () =>
          request(app.getHttpServer())
            .delete(`/api/v1/users/${missingId}`)
            .set('Authorization', `Bearer ${professorToken}`)
            .expect(403),
        () =>
          request(app.getHttpServer())
            .post('/api/v1/materials/categories')
            .set('Authorization', `Bearer ${professorToken}`)
            .send({})
            .expect(403),
        () =>
          request(app.getHttpServer())
            .post('/api/v1/notifications')
            .set('Authorization', `Bearer ${professorToken}`)
            .send({})
            .expect(403),
        () =>
          request(app.getHttpServer())
            .patch(`/api/v1/users/${permissionTargetId}/permissions`)
            .set('Authorization', `Bearer ${professorToken}`)
            .send({ permissions: [] })
            .expect(403),
      ];
      for (const check of checks) await check();
    };

    try {
      await expectDenied();
      const delegatedChecks: Array<{
        permission: Permission;
        run: () => PromiseLike<unknown>;
      }> = [
        {
          permission: Permission.AdminAccess,
          run: () =>
            request(app.getHttpServer())
              .get('/api/v1/users/me')
              .set('Authorization', `Bearer ${professorToken}`)
              .expect(200),
        },
        {
          permission: Permission.UsersManage,
          run: () =>
            request(app.getHttpServer())
              .delete(`/api/v1/users/${missingId}`)
              .set('Authorization', `Bearer ${professorToken}`)
              .expect(404),
        },
        {
          permission: Permission.PermissionsManage,
          run: () =>
            request(app.getHttpServer())
              .patch(`/api/v1/users/${permissionTargetId}/permissions`)
              .set('Authorization', `Bearer ${professorToken}`)
              .send({ permissions: [] })
              .expect(200),
        },
        {
          permission: Permission.LeadsManage,
          run: () =>
            request(app.getHttpServer())
              .get('/api/v1/leads')
              .set('Authorization', `Bearer ${professorToken}`)
              .expect(200),
        },
        {
          permission: Permission.BookingsManage,
          run: async () => {
            await request(app.getHttpServer())
              .patch(`/api/v1/bookings/${missingId}`)
              .set('Authorization', `Bearer ${professorToken}`)
              .send({ notes: 'permitido' })
              .expect(404);
            await request(app.getHttpServer())
              .post('/api/v1/bookings')
              .set('Authorization', `Bearer ${professorToken}`)
              .send({
                title: 'Permissão aplicada',
                date: trainingDate,
                time: '08:00',
                type: BookingType.Training,
                unitId,
                equipmentId,
              })
              .expect(400);
          },
        },
        {
          permission: Permission.BookingsReview,
          run: () =>
            request(app.getHttpServer())
              .post(`/api/v1/bookings/${missingId}/approve`)
              .set('Authorization', `Bearer ${professorToken}`)
              .send({})
              .expect(404),
        },
        {
          permission: Permission.CoursesManage,
          run: () =>
            request(app.getHttpServer())
              .post('/api/v1/courses')
              .set('Authorization', `Bearer ${professorToken}`)
              .send({})
              .expect(400),
        },
        {
          permission: Permission.AttendanceManage,
          run: () =>
            request(app.getHttpServer())
              .patch(`/api/v1/courses/lessons/${missingId}/attendance`)
              .set('Authorization', `Bearer ${professorToken}`)
              .send({ studentId: missingId, present: true })
              .expect(404),
        },
        {
          permission: Permission.MaterialsManage,
          run: () =>
            request(app.getHttpServer())
              .post('/api/v1/materials/categories')
              .set('Authorization', `Bearer ${professorToken}`)
              .send({})
              .expect(400),
        },
        {
          permission: Permission.UnitsManage,
          run: () =>
            request(app.getHttpServer())
              .get('/api/v1/units/admin/all')
              .set('Authorization', `Bearer ${professorToken}`)
              .expect(200),
        },
        {
          permission: Permission.EquipmentsManage,
          run: () =>
            request(app.getHttpServer())
              .get('/api/v1/equipments/admin/all')
              .set('Authorization', `Bearer ${professorToken}`)
              .expect(200),
        },
        {
          permission: Permission.EventsManage,
          run: () =>
            request(app.getHttpServer())
              .post('/api/v1/events')
              .set('Authorization', `Bearer ${professorToken}`)
              .send({
                title: 'Evento oficial por privilégio',
                date: futureDate(40),
                time: '20:00',
                location: 'DJ ON',
                type: EventType.DjOn,
              })
              .expect(201)
              .expect(({ body }) => expect(body.type).toBe(EventType.DjOn)),
        },
        {
          permission: Permission.NotificationsManage,
          run: () =>
            request(app.getHttpServer())
              .post('/api/v1/notifications')
              .set('Authorization', `Bearer ${professorToken}`)
              .send({})
              .expect(400),
        },
      ];
      for (const delegated of delegatedChecks) {
        await request(app.getHttpServer())
          .patch(`/api/v1/users/${professorId}/permissions`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ permissions: [delegated.permission] })
          .expect(200)
          .expect(({ body }) => {
            if (delegated.permission === Permission.PermissionsManage) {
              expect(body.permissions).toEqual(
                expect.arrayContaining([
                  Permission.PermissionsManage,
                  Permission.UsersManage,
                ]),
              );
            }
          });
        await delegated.run();
      }

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${professorId}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissions: allPermissions })
        .expect(200)
        .expect(({ body }) =>
          expect(body.permissions.sort()).toEqual([...allPermissions].sort()),
        );

      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${professorToken}`)
        .expect(200)
        .expect(({ body }) =>
          expect(body.permissions.sort()).toEqual([...allPermissions].sort()),
        );

      await request(app.getHttpServer())
        .get('/api/v1/leads')
        .set('Authorization', `Bearer ${professorToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/units/admin/all')
        .set('Authorization', `Bearer ${professorToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/equipments/admin/all')
        .set('Authorization', `Bearer ${professorToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/audit-logs?limit=1')
        .set('Authorization', `Bearer ${professorToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/api/v1/users/${missingId}`)
        .set('Authorization', `Bearer ${professorToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/bookings/${missingId}`)
        .set('Authorization', `Bearer ${professorToken}`)
        .send({ notes: 'permitido' })
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/bookings/${missingId}/approve`)
        .set('Authorization', `Bearer ${professorToken}`)
        .send({})
        .expect(404);
      await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${professorToken}`)
        .send({})
        .expect(400);
      await request(app.getHttpServer())
        .patch(`/api/v1/courses/lessons/${missingId}/attendance`)
        .set('Authorization', `Bearer ${professorToken}`)
        .send({ studentId: missingId, present: true })
        .expect(404);
      await request(app.getHttpServer())
        .post('/api/v1/materials')
        .set('Authorization', `Bearer ${professorToken}`)
        .send({})
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${professorId}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissions: [] })
        .expect(200);
      await expectDenied();
    } finally {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${professorId}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissions: allPermissions })
        .expect(200);
    }
  });

  it('amplia o escopo nativo por domínio e iguala o professor ao admin com acesso total', async () => {
    const adminToken = tokens[Role.Admin];
    const professorToken = tokens[Role.Professor];
    const grant = async (...permissions: Permission[]) => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${professorId}/permissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ permissions })
        .expect(200);
    };

    const secondaryUnit = await app.get(UnitsService).create({
      key: 'sp-e2e',
      label: 'São Paulo / SP',
      shortLabel: 'SP',
      address: 'Unidade secundária E2E',
    });
    const secondaryUnitId = String(secondaryUnit.id);
    const secondaryEquipment = await app.get(EquipmentsService).create({
      name: 'Setup SP E2E',
      unitId: secondaryUnitId,
    });
    const secondaryEquipmentId = String(secondaryEquipment._id);
    const users = app.get(UsersService);
    const secondaryProfessor = await users.create({
      name: 'Professor SP E2E',
      email: 'professor-sp@teste.com',
      password,
      role: Role.Professor,
      unitId: secondaryUnitId,
    });
    const secondaryStudent = await users.create({
      name: 'Aluno SP E2E',
      email: 'aluno-sp@teste.com',
      password,
      role: Role.Student,
      unitId: secondaryUnitId,
      trainingHoursLimit: 8,
    });
    const secondaryProfessorToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `127.0.0.${loginIpOctet++}`)
        .send({ email: 'professor-sp@teste.com', password })
        .expect(201)
    ).body.accessToken as string;
    const secondaryStudentToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `127.0.0.${loginIpOctet++}`)
        .send({ email: 'aluno-sp@teste.com', password })
        .expect(201)
    ).body.accessToken as string;

    try {
      await grant();
      const pending = await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${secondaryStudentToken}`)
        .send({
          title: 'Treino fora da unidade do professor principal',
          date: futureDate(5),
          time: '09:00',
          type: BookingType.Training,
          unitId: secondaryUnitId,
          equipmentId: secondaryEquipmentId,
        });
      if (pending.status !== 201) {
        throw new Error(
          `Criação do treino secundário falhou: ${pending.status} ${JSON.stringify(pending.body)}`,
        );
      }
      const pendingId = String(pending.body.id);

      await request(app.getHttpServer())
        .get(`/api/v1/bookings/${pendingId}`)
        .set('Authorization', `Bearer ${professorToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/bookings?limit=100')
        .set('Authorization', `Bearer ${professorToken}`)
        .expect(200)
        .expect(({ body }) =>
          expect(
            body.items.map((item: { id: string }) => String(item.id)),
          ).not.toContain(pendingId),
        );

      await grant(Permission.BookingsReview);
      await request(app.getHttpServer())
        .post(`/api/v1/bookings/${pendingId}/approve`)
        .set('Authorization', `Bearer ${professorToken}`)
        .send({})
        .expect(201)
        .expect(({ body }) => expect(body.status).toBe('confirmado'));

      await grant(Permission.BookingsManage);
      await request(app.getHttpServer())
        .post('/api/v1/bookings')
        .set('Authorization', `Bearer ${professorToken}`)
        .send({
          studentId: String(secondaryStudent.id),
          title: 'Agenda global delegada',
          date: futureDate(6),
          time: '10:00',
          type: BookingType.Training,
          unitId: secondaryUnitId,
          equipmentId: secondaryEquipmentId,
        })
        .expect(201)
        .expect(({ body }) => expect(body.status).toBe('confirmado'));

      const nativeEvent = await request(app.getHttpServer())
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${secondaryProfessorToken}`)
        .send({
          title: 'Evento nativo do professor',
          date: futureDate(52),
          time: '20:00',
          location: 'São Paulo',
          type: EventType.DjOn,
        })
        .expect(201);
      expect(nativeEvent.body.type).toBe(EventType.Professor);

      await grant(Permission.EventsManage);
      const officialEvent = await request(app.getHttpServer())
        .post('/api/v1/events')
        .set('Authorization', `Bearer ${professorToken}`)
        .send({
          title: 'Evento oficial delegado',
          date: futureDate(53),
          time: '20:00',
          location: 'DJ ON',
          type: EventType.DjOn,
        })
        .expect(201);
      expect(officialEvent.body.type).toBe(EventType.DjOn);
      await request(app.getHttpServer())
        .delete(`/api/v1/events/${String(nativeEvent.body.id)}`)
        .set('Authorization', `Bearer ${professorToken}`)
        .expect(200);

      const category = await request(app.getHttpServer())
        .post('/api/v1/materials/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Escopo de privilégios E2E' })
        .expect(201);
      const foreignMaterial = await request(app.getHttpServer())
        .post('/api/v1/materials')
        .set('Authorization', `Bearer ${secondaryProfessorToken}`)
        .send({
          title: 'Material de outro professor',
          categoryId: String(category.body.id),
          body: '<p>Conteúdo externo.</p>',
          status: 'published',
        })
        .expect(201);

      await grant();
      await request(app.getHttpServer())
        .patch(`/api/v1/materials/${String(foreignMaterial.body.id)}`)
        .set('Authorization', `Bearer ${professorToken}`)
        .send({ title: 'Tentativa sem privilégio' })
        .expect(403);
      await grant(Permission.MaterialsManage);
      await request(app.getHttpServer())
        .patch(`/api/v1/materials/${String(foreignMaterial.body.id)}`)
        .set('Authorization', `Bearer ${professorToken}`)
        .send({ title: 'Material administrado globalmente' })
        .expect(200)
        .expect(({ body }) =>
          expect(body.title).toBe('Material administrado globalmente'),
        );

      await grant(...Object.values(Permission));
      await request(app.getHttpServer())
        .get('/api/v1/users?includeInactive=true&limit=100')
        .set('Authorization', `Bearer ${professorToken}`)
        .expect(200)
        .expect(({ body }) =>
          expect(
            body.items.map((item: { id: string }) => String(item.id)),
          ).toEqual(
            expect.arrayContaining([
              professorId,
              String(secondaryProfessor.id),
              String(secondaryStudent.id),
            ]),
          ),
        );
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${professorId}/permissions`)
        .set('Authorization', `Bearer ${professorToken}`)
        .send({ permissions: [] })
        .expect(403);
    } finally {
      await grant(...Object.values(Permission));
    }
  });

  it('executa o ciclo administrativo completo de um aluno', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        name: 'Aluno Gerenciado',
        email: 'aluno-gerenciado@teste.com',
        password,
        role: Role.Student,
        unitId,
        whatsapp: '51999990000',
        cpf: '000.000.000-00',
        birthDate: '2000-01-02',
        trainingHoursLimit: 12,
      })
      .expect(201);
    managedStudentId = String(created.body.id);
    expect(created.body.trainingHoursLimit).toBe(12);
    expect(created.body.unitId.id).toBe(unitId);

    await request(app.getHttpServer())
      .patch(`/api/v1/users/${managedStudentId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ name: 'Aluno Gerenciado Atualizado', whatsapp: '51988880000' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.name).toBe('Aluno Gerenciado Atualizado');
        expect(body.whatsapp).toBe('51988880000');
      });

    await request(app.getHttpServer())
      .delete(`/api/v1/users/${managedStudentId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) => expect(body.active).toBe(false));

    await request(app.getHttpServer())
      .get('/api/v1/users?includeInactive=true')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) => {
        const managed = body.items.find(
          (item: { id: string }) => item.id === managedStudentId,
        );
        expect(managed.active).toBe(false);
        expect(managed.trainingHoursLimit).toBe(12);
      });

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `127.0.0.${loginIpOctet++}`)
      .send({
        email: 'aluno-gerenciado@teste.com',
        password: 'senha-incorreta',
      })
      .expect(401)
      .expect(({ body }) =>
        expect(body.message).toBe('E-mail ou senha inválidos.'),
      );

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `127.0.0.${loginIpOctet++}`)
      .send({ email: 'aluno-gerenciado@teste.com', password })
      .expect(403)
      .expect(({ body }) =>
        expect(body.message).toBe(
          'Sua conta está desativada. Entre em contato com a administração para recuperar o acesso.',
        ),
      );

    await request(app.getHttpServer())
      .post(`/api/v1/users/${managedStudentId}/restore`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(201)
      .expect(({ body }) => expect(body.active).toBe(true));

    const login = await app.get(AuthService).login({
      email: 'aluno-gerenciado@teste.com',
      password,
    });
    managedStudentToken = login.accessToken;
  });

  it('envia, substitui e remove avatar e banner do perfil no R2', async () => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const uploadImage = (purpose: 'avatar' | 'banner') =>
      request(app.getHttpServer())
        .post('/api/v1/files')
        .set('Authorization', `Bearer ${managedStudentToken}`)
        .field('purpose', purpose)
        .attach('file', pixel, {
          filename: `${purpose}-${Date.now()}.png`,
          contentType: 'image/png',
        })
        .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${managedStudentToken}`)
      .field('purpose', 'avatar')
      .attach('file', Buffer.from('nao-e-imagem'), {
        filename: 'avatar.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    const firstAvatar = await uploadImage('avatar');
    const banner = await uploadImage('banner');
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${managedStudentToken}`)
      .send({ avatar: firstAvatar.body.url, banner: banner.body.url })
      .expect(200)
      .expect(({ body }) => {
        expect(body.avatar).toBe(firstAvatar.body.url);
        expect(body.banner).toBe(banner.body.url);
      });

    const nextAvatar = await uploadImage('avatar');
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${managedStudentToken}`)
      .send({ avatar: nextAvatar.body.url })
      .expect(200);
    await request(app.getHttpServer())
      .get(String(firstAvatar.body.url))
      .expect(404);

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${managedStudentToken}`)
      .send({ avatar: '', banner: '' })
      .expect(200);
    await request(app.getHttpServer())
      .get(String(nextAvatar.body.url))
      .expect(404);
    await request(app.getHttpServer()).get(String(banner.body.url)).expect(404);
  });

  it('altera a própria senha e autentica com a nova credencial', async () => {
    const newPassword = 'NovaSenha@2026';
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({ currentPassword: password, newPassword })
      .expect(200)
      .expect(({ body }) => expect(body.changed).toBe(true));
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', `127.0.0.${loginIpOctet++}`)
      .send({ email: 'aluno1@teste.com', password: newPassword })
      .expect(201);
  });

  it('cadastra e remove uma assinatura de push', async () => {
    const endpoint = 'https://push.example.test/subscription/e2e';
    await request(app.getHttpServer())
      .post('/api/v1/notifications/push-subscriptions')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({ endpoint, p256dh: 'chave-publica-e2e', auth: 'auth-e2e' })
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/notifications/push-subscriptions')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({ endpoint })
      .expect(200);
  });

  it('cria, conta, lê e remove notificações do destinatário correto', async () => {
    const student = await connection
      .collection('users')
      .findOne({ email: 'aluno1@teste.com' });
    const created = await request(app.getHttpServer())
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        recipientIds: [String(student?._id)],
        type: 'e2e.manual',
        title: 'Notificação E2E',
        body: 'Validação completa da central.',
        url: '/dashboard/notificacoes',
        metadata: { source: 'e2e' },
      })
      .expect(201);
    const notificationId = String(created.body[0].id);

    await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => expect(body.count).toBeGreaterThan(0));
    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${secondStudentToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => expect(body.readAt).toBeTruthy());

    const second = await request(app.getHttpServer())
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        recipientIds: [String(student?._id)],
        type: 'e2e.read-all',
        title: 'Segunda notificação E2E',
        body: 'Validação do marcar todas como lidas.',
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => expect(body.updated).toBeGreaterThan(0));
    await request(app.getHttpServer())
      .delete(`/api/v1/notifications/${String(second.body[0].id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => expect(body.removed).toBe(true));
  });

  it('cria treino pendente, impede conflito e permite aprovação', async () => {
    const forbiddenLesson = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({
        title: 'Aula solicitada pelo aluno',
        date: trainingDate,
        time: '18:00',
        type: BookingType.Lesson,
        unitId,
        professorId,
        equipmentId,
      });
    expect({
      status: forbiddenLesson.status,
      message: forbiddenLesson.body.message,
    }).toEqual({
      status: 403,
      message:
        'Alunos podem solicitar apenas treinos. Aulas são agendadas pelos professores ou pela administração.',
    });

    await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({
        title: 'Treino sem equipamento',
        date: trainingDate,
        time: '18:00',
        type: BookingType.Training,
        unitId,
      })
      .expect(400)
      .expect(({ body }) =>
        expect(body.message).toBe('Selecione o equipamento.'),
      );

    const created = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({
        title: 'Treino de Beat Match',
        date: trainingDate,
        time: '19:00',
        type: BookingType.Training,
        unitId,
        equipmentId,
        durationMinutes: 120,
        notes: 'Revisar transições.',
      })
      .expect(201);
    bookingId = created.body.id as string;
    expect(created.body.type).toBe(BookingType.Training);
    expect(created.body.status).toBe('pendente');
    expect(created.body.durationMinutes).toBe(120);
    expect(created.body.equipmentId.id).toBe(equipmentId);

    await request(app.getHttpServer())
      .get(
        `/api/v1/bookings/availability?date=${trainingDate}&unitId=${unitId}&type=treino&equipmentId=${equipmentId}`,
      )
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => expect(body.occupiedTimes).toContain('19:00'));

    await request(app.getHttpServer())
      .get('/api/v1/bookings/training-balance')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.limitHours).toBe(8);
        expect(body.reservedHours).toBe(2);
        expect(body.remainingHours).toBe(6);
      });

    await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${secondStudentToken}`)
      .send({
        title: 'Mesmo horário',
        date: trainingDate,
        time: '19:00',
        type: BookingType.Training,
        unitId,
        equipmentId,
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/v1/bookings/${bookingId}/approve`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({})
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('confirmado'));

    await request(app.getHttpServer())
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.some(
            (item: { type: string }) => item.type === 'booking.confirmado',
          ),
        ).toBe(true),
      );
  });

  it('consulta disponibilidade mensal, recusa e cancela solicitações', async () => {
    await request(app.getHttpServer())
      .get(
        `/api/v1/bookings/availability/month?month=${trainingDate.slice(0, 7)}&unitId=${unitId}&type=treino&equipmentId=${equipmentId}&durationMinutes=30`,
      )
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => {
        expect(Array.isArray(body.availableDates)).toBe(true);
      });

    const rejected = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${secondStudentToken}`)
      .send({
        title: 'Treino para recusar',
        date: trainingDate,
        time: '08:00',
        durationMinutes: 30,
        type: BookingType.Training,
        unitId,
        equipmentId,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/bookings/${String(rejected.body.id)}/reject`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({ reason: 'Horário reservado para manutenção.' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('recusado'));

    const cancelled = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${secondStudentToken}`)
      .send({
        title: 'Treino para cancelar',
        date: trainingDate,
        time: '09:00',
        durationMinutes: 30,
        type: BookingType.Training,
        unitId,
        equipmentId,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/bookings/${String(cancelled.body.id)}/cancel`)
      .set('Authorization', `Bearer ${secondStudentToken}`)
      .send({ reason: 'Mudança de planos.' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('cancelado'));
  });

  it('restringe a remoção e exclui o agendamento para a administração', async () => {
    const student = await connection
      .collection('users')
      .findOne({ email: 'aluno1@teste.com' });
    const created = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        studentId: student?._id,
        title: 'Agendamento removível',
        date: '2030-08-26',
        time: '12:00',
        type: BookingType.Training,
        status: 'pendente',
        unitId,
        equipmentId,
      })
      .expect(201);
    expect(created.body.status).toBe('confirmado');
    const removableId = String(created.body.id);

    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${removableId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ status: 'pendente' })
      .expect(400)
      .expect(({ body }) =>
        expect(body.message).toBe(
          'Somente solicitações de treino feitas por alunos podem ficar pendentes.',
        ),
      );

    await request(app.getHttpServer())
      .delete(`/api/v1/bookings/${removableId}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/bookings/${removableId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(removableId));

    await request(app.getHttpServer())
      .get(`/api/v1/bookings/${removableId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(404);
  });

  it('aprova remarcação por edição e cancela o agendamento original', async () => {
    const original = await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        studentId: (
          await connection
            .collection('users')
            .findOne({ email: 'aluno1@teste.com' })
        )?._id,
        title: 'Treino original',
        date: originalTrainingDate,
        time: '18:00',
        type: BookingType.Training,
        unitId,
        equipmentId,
      })
      .expect(201);

    const rescheduled = await request(app.getHttpServer())
      .post(`/api/v1/bookings/${String(original.body.id)}/reschedule`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({
        title: 'Treino remarcado',
        date: rescheduledTrainingDate,
        time: '18:00',
        type: BookingType.Training,
        unitId,
        equipmentId,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/bookings/${String(rescheduled.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({ status: 'confirmado', notes: 'Aprovado após ajuste.' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('confirmado');
        expect(body.notes).toContain('Aprovado');
      });

    await request(app.getHttpServer())
      .get(`/api/v1/bookings/${String(original.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('cancelado'));
  });

  it('executa cursos, turma atômica, conflitos, agenda e liberação de material', async () => {
    const adminToken = tokens[Role.Admin];
    const professorToken = tokens[Role.Professor];
    const studentToken = tokens[Role.Student];
    const student = await connection
      .collection('users')
      .findOne({ email: 'aluno1@teste.com' });
    expect(student?._id).toBeDefined();

    const createdCourse = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Formação E2E',
        description: 'Curso completo para validar o fluxo acadêmico.',
        coverImage: 'https://images.example.test/formacao-e2e.jpg',
      })
      .expect(201);
    const courseId = String(createdCourse.body.id);

    await request(app.getHttpServer())
      .patch(`/api/v1/courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Descrição atualizada no fluxo E2E.' })
      .expect(200)
      .expect(({ body }) =>
        expect(body.description).toBe('Descrição atualizada no fluxo E2E.'),
      );

    const categories = await request(app.getHttpServer())
      .get('/api/v1/materials/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const coursesCategory = categories.body.find(
      (item: { systemKey?: string }) => item.systemKey === 'courses',
    );
    expect(coursesCategory).toMatchObject({
      name: 'Cursos',
      type: 'curso',
      active: true,
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/materials/categories/${String(coursesCategory.id)}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cursos editados' })
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/api/v1/materials/categories/${String(coursesCategory.id)}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    const lessonMaterialIds: string[] = [];
    for (const index of [1, 2]) {
      const material = await request(app.getHttpServer())
        .post('/api/v1/materials')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: `Aula E2E ${index}`,
          description: `Conteúdo da aula ${index}.`,
          body: `<p>Material completo da aula ${index}.</p>`,
          courseId,
          status: 'published',
        })
        .expect(201);
      lessonMaterialIds.push(String(material.body.id));
      expect(material.body.categoryId.id).toBe(String(coursesCategory.id));
    }

    await request(app.getHttpServer())
      .get(`/api/v1/materials?courseId=${courseId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toHaveLength(2);
        expect(
          body.items.every((item: { locked: boolean }) => item.locked),
        ).toBe(true);
      });

    const conflictDate = futureDate(20);
    await request(app.getHttpServer())
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        studentId: String(student?._id),
        title: 'Reserva que conflita com a turma',
        date: conflictDate,
        time: '10:00',
        durationMinutes: 60,
        type: BookingType.Training,
        unitId,
        equipmentId,
      })
      .expect(201);

    const cohortsBeforeConflict = await connection
      .collection('cohorts')
      .countDocuments();
    const classBookingsBeforeConflict = await connection
      .collection('bookings')
      .countDocuments({ isClassLesson: true });
    await request(app.getHttpServer())
      .post('/api/v1/courses/cohorts/complete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Turma com conflito E2E',
        courseId,
        unitId,
        professorId,
        equipmentId,
        studentIds: [String(student?._id)],
        lessonCount: 2,
        durationMinutes: 60,
        lessons: [
          {
            materialId: lessonMaterialIds[0],
            date: conflictDate,
            time: '10:00',
          },
          {
            materialId: lessonMaterialIds[1],
            date: futureDate(21),
            time: '10:00',
          },
        ],
      })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('COHORT_SCHEDULE_CONFLICT');
        expect(body.conflicts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              lessonIndex: 0,
              kind: 'equipment',
              conflictingTitle: 'Reserva que conflita com a turma',
            }),
          ]),
        );
      });
    expect(await connection.collection('cohorts').countDocuments()).toBe(
      cohortsBeforeConflict,
    );
    expect(
      await connection
        .collection('bookings')
        .countDocuments({ isClassLesson: true }),
    ).toBe(classBookingsBeforeConflict);

    const createdCohort = await request(app.getHttpServer())
      .post('/api/v1/courses/cohorts/complete')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Turma completa E2E',
        courseId,
        unitId,
        professorId,
        equipmentId,
        studentIds: [String(student?._id)],
        lessonCount: 2,
        durationMinutes: 60,
        lessons: [
          {
            materialId: lessonMaterialIds[0],
            date: futureDate(22),
            time: '10:00',
          },
          {
            materialId: lessonMaterialIds[1],
            date: futureDate(23),
            time: '10:00',
          },
        ],
      });
    if (createdCohort.status !== 201) {
      throw new Error(
        `Criação da turma falhou: ${createdCohort.status} ${JSON.stringify(createdCohort.body)}`,
      );
    }
    const cohortId = String(createdCohort.body.id);
    expect(createdCohort.body).toMatchObject({
      name: 'Turma completa E2E',
      status: 'ativa',
      lessonCount: 2,
      durationMinutes: 60,
    });
    expect(createdCohort.body.professorId.id).toBe(professorId);
    expect(createdCohort.body.lessons).toHaveLength(2);
    expect(
      await connection
        .collection('bookings')
        .countDocuments({ isClassLesson: true }),
    ).toBe(classBookingsBeforeConflict + 2);
    await request(app.getHttpServer())
      .get('/api/v1/bookings?limit=100')
      .set('Authorization', `Bearer ${professorToken}`)
      .expect(200)
      .expect(({ body }) => {
        const classBooking = body.items.find(
          (item: { cohortId?: { id?: string } | string }) =>
            (typeof item.cohortId === 'string'
              ? item.cohortId
              : item.cohortId?.id) === cohortId,
        );
        expect(classBooking).toMatchObject({
          isClassLesson: true,
          cohortName: 'Turma completa E2E',
        });
        expect(String(classBooking.lessonId)).toBeTruthy();
      });

    await request(app.getHttpServer())
      .get(`/api/v1/courses/cohorts/${cohortId}`)
      .set('Authorization', `Bearer ${secondStudentToken}`)
      .expect(403);
    const studentCohort = await request(app.getHttpServer())
      .get(`/api/v1/courses/cohorts/${cohortId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(
      studentCohort.body.lessons.every(
        (lesson: { locked: boolean }) => lesson.locked,
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/v1/materials/${lessonMaterialIds[0]}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);

    const firstLessonId = String(createdCohort.body.lessons[0].id);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${professorId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissions: [] })
      .expect(200);
    const attendanceUpdate = await request(app.getHttpServer())
      .patch(`/api/v1/courses/lessons/${firstLessonId}/attendance`)
      .set('Authorization', `Bearer ${professorToken}`)
      .send({ studentId: String(student?._id), present: true })
      .expect(200);
    const firstAttendance = attendanceUpdate.body.lessons[0].attendance.find(
      (item: { studentId: { id: string } }) =>
        item.studentId.id === String(student?._id),
    );
    expect(firstAttendance).toMatchObject({
      present: true,
      materialReleased: true,
    });

    const otherProfessor = await app.get(UsersService).create({
      name: 'Professor Visitante',
      email: 'professor-visitante@teste.com',
      password,
      role: Role.Professor,
      unitId,
    });
    const otherProfessorToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `127.0.0.${loginIpOctet++}`)
        .send({ email: 'professor-visitante@teste.com', password })
        .expect(201)
    ).body.accessToken as string;
    const otherCohort = await request(app.getHttpServer())
      .post('/api/v1/courses/cohorts/complete')
      .set('Authorization', `Bearer ${otherProfessorToken}`)
      .send({
        name: 'Turma do professor visitante',
        courseId,
        unitId,
        professorId: String(otherProfessor.id),
        equipmentId,
        studentIds: [String(student?._id)],
        lessonCount: 2,
        durationMinutes: 60,
        lessons: [
          {
            materialId: lessonMaterialIds[0],
            date: futureDate(26),
            time: '10:00',
          },
          {
            materialId: lessonMaterialIds[1],
            date: futureDate(27),
            time: '10:00',
          },
        ],
      })
      .expect(201);
    const otherCohortId = String(otherCohort.body.id);
    const otherLessonId = String(otherCohort.body.lessons[0].id);

    await request(app.getHttpServer())
      .get('/api/v1/courses/cohorts')
      .set('Authorization', `Bearer ${professorToken}`)
      .expect(200)
      .expect(({ body }) => {
        const ids = body.map((item: { id: string }) => String(item.id));
        expect(ids).toContain(cohortId);
        expect(ids).not.toContain(otherCohortId);
      });
    await request(app.getHttpServer())
      .get(`/api/v1/courses/cohorts/${otherCohortId}`)
      .set('Authorization', `Bearer ${professorToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/courses/lessons/${otherLessonId}/attendance`)
      .set('Authorization', `Bearer ${professorToken}`)
      .send({ studentId: String(student?._id), present: true })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${professorId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissions: [Permission.CoursesManage] })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/courses/cohorts')
      .set('Authorization', `Bearer ${professorToken}`)
      .expect(200)
      .expect(({ body }) => {
        const ids = body.map((item: { id: string }) => String(item.id));
        expect(ids).toEqual(expect.arrayContaining([cohortId, otherCohortId]));
      });
    await request(app.getHttpServer())
      .get(`/api/v1/courses/cohorts/${otherCohortId}`)
      .set('Authorization', `Bearer ${professorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/courses/lessons/${otherLessonId}/attendance`)
      .set('Authorization', `Bearer ${professorToken}`)
      .send({ studentId: String(student?._id), present: true })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${professorId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissions: [Permission.AttendanceManage] })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/courses/cohorts')
      .set('Authorization', `Bearer ${professorToken}`)
      .expect(200)
      .expect(({ body }) => {
        const ids = body.map((item: { id: string }) => String(item.id));
        expect(ids).toEqual(expect.arrayContaining([cohortId, otherCohortId]));
      });
    await request(app.getHttpServer())
      .get(`/api/v1/courses/cohorts/${otherCohortId}`)
      .set('Authorization', `Bearer ${professorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/courses/lessons/${otherLessonId}/attendance`)
      .set('Authorization', `Bearer ${professorToken}`)
      .send({ studentId: String(student?._id), present: true })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${professorId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissions: Object.values(Permission) })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/materials/${lessonMaterialIds[0]}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/materials/${lessonMaterialIds[1]}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.map((item: { id: string }) => item.id)).toContain(courseId),
      );

    const setupCohort = await request(app.getHttpServer())
      .post('/api/v1/courses/cohorts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Turma configurada depois E2E',
        courseId,
        unitId,
        professorId,
        equipmentId,
        studentIds: [String(student?._id)],
        lessonCount: 2,
        durationMinutes: 60,
      })
      .expect(201);
    expect(setupCohort.body.status).toBe('configuracao');
    await request(app.getHttpServer())
      .post(`/api/v1/courses/cohorts/${String(setupCohort.body.id)}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lessons: [
          {
            materialId: lessonMaterialIds[0],
            date: futureDate(24),
            time: '10:00',
          },
          {
            materialId: lessonMaterialIds[1],
            date: futureDate(25),
            time: '10:00',
          },
        ],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('ativa');
        expect(body.lessons).toHaveLength(2);
      });

    await request(app.getHttpServer())
      .delete(`/api/v1/courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
  });

  it('mantém unidades inativas fora da rota pública', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        key: 'temporaria',
        label: 'Temporária',
        shortLabel: 'TMP',
        address: 'Endereço temporário',
        active: true,
      })
      .expect(201);
    expect(created.body.key).toBe('temporaria');
    await request(app.getHttpServer())
      .post('/api/v1/units')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        key: 'TEMPORARIA',
        label: 'Temporária duplicada',
        shortLabel: 'TMP2',
        address: 'Outro endereço',
        active: true,
      })
      .expect(409)
      .expect(({ body }) =>
        expect(body.message).toBe('Identificador de unidade já cadastrado.'),
      );
    await request(app.getHttpServer())
      .delete(`/api/v1/units/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/units')
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.some((unit: { key: string }) => unit.key === 'temporaria'),
        ).toBe(false),
      );
    await request(app.getHttpServer())
      .get('/api/v1/units/admin/all')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.some((unit: { key: string }) => unit.key === 'temporaria'),
        ).toBe(true),
      );
  });

  it('gerencia equipamentos por unidade e oculta os inativos', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/equipments')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({
        name: 'Controladora temporária',
        description: 'Equipamento para validar o CRUD.',
        unitId,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/equipments')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ name: 'Controladora temporária', unitId })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/v1/equipments/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ description: 'Descrição atualizada.' })
      .expect(200)
      .expect(({ body }) =>
        expect(body.description).toBe('Descrição atualizada.'),
      );

    await request(app.getHttpServer())
      .delete(`/api/v1/equipments/${String(created.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/equipments')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.some(
            (equipment: { id: string }) =>
              equipment.id === String(created.body.id),
          ),
        ).toBe(false),
      );

    await request(app.getHttpServer())
      .get('/api/v1/equipments/admin/all')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.some(
            (equipment: { id: string }) =>
              equipment.id === String(created.body.id),
          ),
        ).toBe(true),
      );
  });

  it('garante propriedade dos eventos do mural', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({
        title: 'Primeiro Gig',
        date: '2030-09-01',
        time: '22:00',
        location: 'Clube Teste',
        instagram: '@clube_teste',
        type: EventType.DjOn,
      })
      .expect(201);
    eventId = created.body.id as string;
    expect(created.body.type).toBe(EventType.Student);

    await request(app.getHttpServer())
      .delete(`/api/v1/events/${eventId}`)
      .set('Authorization', `Bearer ${secondStudentToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/events/${eventId}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({ title: 'Primeiro Gig Atualizado' })
      .expect(200)
      .expect(({ body }) => expect(body.title).toContain('Atualizado'));
    await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(eventId));
    await request(app.getHttpServer())
      .get('/api/v1/events?type=student')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.map((item: { id: string }) => item.id)).toContain(
          eventId,
        ),
      );
    const removable = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({
        title: 'Evento removível E2E',
        date: '2030-09-02',
        time: '22:00',
        location: 'Clube Teste',
      })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/events/${String(removable.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(String(removable.body.id)));
  });

  it('publica material sanitizado e gerencia categoria', async () => {
    const category = await request(app.getHttpServer())
      .post('/api/v1/materials/categories')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ name: 'Técnica' })
      .expect(201);
    categoryId = category.body.id as string;

    const material = await request(app.getHttpServer())
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({
        title: 'Guia seguro',
        categoryId,
        body: '<h2>Conteúdo</h2><script>alert(1)</script><p>Válido</p>',
      })
      .expect(201);
    materialId = material.body.id as string;
    expect(material.body.body).toContain('<h2>Conteúdo</h2>');
    expect(material.body.body).not.toContain('<script>');

    await request(app.getHttpServer())
      .get(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200);
  });

  it('isola rascunhos por autor e não os expõe aos alunos', async () => {
    const draft = await request(app.getHttpServer())
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({
        title: '',
        body: '<p>Rascunho privado E2E</p>',
        status: 'draft',
      })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('draft'));
    const draftId = String(draft.body.id);

    await request(app.getHttpServer())
      .get(`/api/v1/materials/${draftId}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/materials/${draftId}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/materials/${draftId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(404);

    await request(app.getHttpServer())
      .get('/api/v1/materials?limit=100')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.map((item: { id: string }) => item.id)).toContain(
          draftId,
        ),
      );
    await request(app.getHttpServer())
      .get('/api/v1/materials?limit=100')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.map((item: { id: string }) => item.id)).not.toContain(
          draftId,
        ),
      );

    await request(app.getHttpServer())
      .patch(`/api/v1/materials/${draftId}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({ title: 'Rascunho atualizado E2E' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('draft'));
    await request(app.getHttpServer())
      .get('/api/v1/search?q=Rascunho%20atualizado%20E2E')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.materials.map((item: { id: string }) => item.id),
        ).not.toContain(draftId),
      );
    await request(app.getHttpServer())
      .delete(`/api/v1/materials/${draftId}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .expect(200);
  });

  it('envia, serve e remove arquivo no Cloudflare R2', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .field('purpose', 'other')
      .attach('file', Buffer.from('arquivo-r2-e2e'), {
        filename: 'avatar-e2e.txt',
        contentType: 'text/plain',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(uploaded.body.url as string)
      .expect(200)
      .expect('Content-Type', /text\/plain/)
      .expect('Cross-Origin-Resource-Policy', 'cross-origin');

    await request(app.getHttpServer())
      .delete(`/api/v1/files/${String(uploaded.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(uploaded.body.url as string)
      .expect(404);
  });

  it('remove do R2 os arquivos vinculados quando o material é excluído', async () => {
    const uploaded = await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .field('purpose', 'material-cover')
      .attach('file', Buffer.from('capa-material-e2e'), {
        filename: 'capa-e2e.png',
        contentType: 'image/png',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({ coverImage: uploaded.body.url })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(uploaded.body.url as string)
      .expect(404);
  });

  it('executa o CRUD completo de material rico, anexos e categorias', async () => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const sourceCategory = await request(app.getHttpServer())
      .post('/api/v1/materials/categories')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ name: 'Categoria Origem E2E' })
      .expect(201);
    const targetCategory = await request(app.getHttpServer())
      .post('/api/v1/materials/categories')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ name: 'Categoria Destino E2E' })
      .expect(201);

    const cover = await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .field('purpose', 'material-cover')
      .attach('file', pixel, {
        filename: 'capa-completa.png',
        contentType: 'image/png',
      })
      .expect(201);
    const bodyImage = await request(app.getHttpServer())
      .post('/api/v1/files/rich-text')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .attach('file', pixel, {
        filename: 'imagem-corpo.png',
        contentType: 'image/png',
      })
      .expect(201);
    const attachment = await request(app.getHttpServer())
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .field('purpose', 'material-attachment')
      .attach('file', Buffer.from('%PDF-1.4 material e2e'), {
        filename: 'apostila-e2e.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    const material = await request(app.getHttpServer())
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({
        title: 'Material Completo E2E',
        description: 'Resumo do material completo.',
        categoryId: sourceCategory.body.id,
        coverImage: cover.body.url,
        body: `<h2>Aula completa</h2><p>Conteúdo rico.</p><img src="${bodyImage.body.url}" alt="Imagem do conteúdo">`,
        attachments: [
          {
            legacyId: attachment.body.id,
            name: 'apostila-e2e.pdf',
            type: 'pdf',
            url: attachment.body.url,
            size: '20 B',
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/materials/${String(material.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.title).toBe('Material Completo E2E');
        expect(body.coverImage).toBe(cover.body.url);
        expect(body.body).toContain(bodyImage.body.url);
        expect(body.attachments).toHaveLength(1);
        expect(body.attachments[0].legacyId).toBe(attachment.body.id);
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/materials/${String(material.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Professor]}`)
      .send({
        title: 'Material Completo Atualizado',
        body: '<p>Nova versão.</p>',
      })
      .expect(200)
      .expect(({ body }) => expect(body.title).toContain('Atualizado'));
    await request(app.getHttpServer())
      .get(String(bodyImage.body.url))
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/materials/categories/${String(sourceCategory.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ name: 'Categoria Origem Renomeada E2E' })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/materials/categories/${String(sourceCategory.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ transferToCategoryId: targetCategory.body.id })
      .expect(200)
      .expect(({ body }) => expect(body.transferredMaterials).toBe(1));
    await request(app.getHttpServer())
      .get(`/api/v1/materials/${String(material.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.categoryId.id).toBe(targetCategory.body.id),
      );

    await request(app.getHttpServer())
      .delete(`/api/v1/materials/${String(material.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200);
    await request(app.getHttpServer()).get(String(cover.body.url)).expect(404);
    await request(app.getHttpServer())
      .get(String(attachment.body.url))
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/materials/categories/${String(targetCategory.body.id)}`)
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({})
      .expect(200);
  });

  it('valida payloads desconhecidos e busca integrada', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .send({ role: Role.Admin })
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/v1/search?q=Primeiro')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(200)
      .expect(({ body }) => expect(body.events.length).toBeGreaterThan(0));
  });

  it('normaliza identificadores e registra auditoria administrativa', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/events/identificador-invalido')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(400);

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .send({ bio: 'Evidência técnica de auditoria E2E.' })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${tokens[Role.Student]}`)
      .expect(403);

    await new Promise((resolve) => setTimeout(resolve, 100));
    await request(app.getHttpServer())
      .get('/api/v1/audit-logs?limit=100&method=PATCH')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.total).toBeGreaterThan(0);
        expect(body.items[0].id).toBeDefined();
        const profileUpdate = body.items.find(
          (item: { method: string; path: string }) =>
            item.method === 'PATCH' && item.path === '/api/v1/users/me',
        );
        expect(profileUpdate).toEqual(
          expect.objectContaining({
            actorName: 'Admin Teste',
            actorEmail: 'admin@teste.com',
            actorRole: Role.Admin,
            requestBody: {
              bio: 'Evidência técnica de auditoria E2E.',
            },
          }),
        );
      });

    await request(app.getHttpServer())
      .get('/api/v1/audit-logs?limit=100&method=POST')
      .set('Authorization', `Bearer ${tokens[Role.Admin]}`)
      .expect(200)
      .expect(({ body }) => {
        const adminLogin = body.items.find(
          (item: { actorEmail?: string; method: string; path: string }) =>
            item.actorEmail === 'admin@teste.com' &&
            item.method === 'POST' &&
            item.path === '/api/v1/auth/login',
        );
        expect(adminLogin.requestBody).toEqual({
          email: 'admin@teste.com',
          password: '[REDACTED]',
        });
      });
  });
});
