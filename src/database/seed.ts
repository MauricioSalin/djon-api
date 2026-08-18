import 'dotenv/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { hash } from 'bcryptjs';
import { createHash } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import data from './mock-data.generated.json';

type SeedUser = (typeof data.users)[number];
type SeedEvent = (typeof data.events)[number];
type SeedBooking = (typeof data.bookings)[number];
type SeedMaterial = (typeof data.materials)[number];

function requiredMongoUri() {
  const value = process.env.MONGODB_URI;
  if (!value) throw new Error('MONGODB_URI não configurada.');
  return value;
}

const collectionNames = [
  'users',
  'units',
  'equipment',
  'events',
  'bookings',
  'materialcategories',
  'materials',
  'notifications',
  'pushsubscriptions',
  'auditlogs',
  'leads',
  'uploads.files',
  'uploads.chunks',
  'storedfiles',
];

async function seed() {
  await mongoose.connect(requiredMongoUri(), { autoIndex: false });
  const db = mongoose.connection.db;
  if (!db) throw new Error('Conexão MongoDB indisponível.');

  await Promise.all(
    collectionNames.map((name) => db.collection(name).deleteMany({})),
  );

  const passwordHash = await hash(
    process.env.SEED_DEFAULT_PASSWORD ?? 'DjonTeste@2026',
    12,
  );
  const unitIds = {
    poa: new Types.ObjectId(),
    camboriu: new Types.ObjectId(),
  };
  const userUnitIds: Record<string, Types.ObjectId> = {
    'prof-1': unitIds.poa,
    'prof-2': unitIds.camboriu,
    'student-1': unitIds.poa,
    'student-2': unitIds.camboriu,
    'student-3': unitIds.poa,
    'student-4': unitIds.camboriu,
    'student-5': unitIds.poa,
  };
  const userIds = new Map<string, Types.ObjectId>();
  const userDocuments = data.users.map((user: SeedUser) => {
    const _id = new Types.ObjectId();
    userIds.set(user.id, _id);
    return {
      _id,
      legacyId: user.id,
      name: user.name,
      email: user.email.toLowerCase(),
      passwordHash,
      whatsapp: 'whatsapp' in user ? user.whatsapp : undefined,
      cpf: 'cpf' in user ? user.cpf : undefined,
      birthDate: 'birthDate' in user ? user.birthDate : undefined,
      avatar: user.avatar,
      banner: user.banner,
      bio: user.bio,
      socials: user.socials ?? {},
      role: user.role,
      unitId: userUnitIds[user.id],
      active: true,
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.createdAt),
    };
  });
  await db.collection('users').insertMany(userDocuments);

  await db.collection('units').insertMany([
    {
      _id: unitIds.poa,
      key: 'poa',
      label: 'Porto Alegre / RS',
      shortLabel: 'POA',
      address: 'Rua General Vitorino 77, Sala 504 — Centro, POA',
      mapSrc:
        'https://www.openstreetmap.org/export/embed.html?bbox=-51.2291%2C-30.0323%2C-51.2231%2C-30.0283&layer=mapnik',
      mapsHref:
        'https://www.google.com/maps/search/?api=1&query=-30.0303,-51.2261',
      timezone: 'America/Sao_Paulo',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: unitIds.camboriu,
      key: 'camboriu',
      label: 'Camboriú / SC',
      shortLabel: 'Camboriú',
      address: 'Alameda Cap. Ernesto Nunes, 987 — Bairro Cedros, Camboriú',
      mapSrc:
        'https://www.openstreetmap.org/export/embed.html?bbox=-48.65211135766976%2C-27.036794365919074%2C-48.64611135766976%2C-27.032794365919072&layer=mapnik',
      mapsHref:
        'https://www.google.com/maps/search/?api=1&query=-27.034794365919073,-48.64911135766976',
      timezone: 'America/Sao_Paulo',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const equipmentIds = {
    poa: [new Types.ObjectId(), new Types.ObjectId()],
    camboriu: [new Types.ObjectId(), new Types.ObjectId()],
  };
  await db.collection('equipment').insertMany([
    {
      _id: equipmentIds.poa[0],
      name: 'CDJ-3000 + DJM-A9',
      description: 'Setup profissional com duas CDJs e mixer de quatro canais.',
      unitId: unitIds.poa,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: equipmentIds.poa[1],
      name: 'DDJ-FLX10',
      description: 'Controladora de quatro canais para treinos com Rekordbox.',
      unitId: unitIds.poa,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: equipmentIds.camboriu[0],
      name: 'CDJ-3000 + DJM-A9',
      description: 'Setup profissional com duas CDJs e mixer de quatro canais.',
      unitId: unitIds.camboriu,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: equipmentIds.camboriu[1],
      name: 'DDJ-FLX10',
      description: 'Controladora de quatro canais para treinos com Rekordbox.',
      unitId: unitIds.camboriu,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  const eventDocuments = data.events.map((event: SeedEvent) => ({
    _id: new Types.ObjectId(),
    legacyId: event.id,
    title: event.title,
    date: event.date,
    time: event.time,
    location: event.location,
    instagram: event.instagram?.replace(/^@/, ''),
    description: event.description,
    authorId: requiredUserId(userIds, event.createdBy),
    type: event.type,
    createdAt: new Date(event.createdAt),
    updatedAt: new Date(event.createdAt),
  }));
  await db.collection('events').insertMany(eventDocuments);

  const adminId = requiredUserId(userIds, 'admin-1');
  const professorIds = [
    requiredUserId(userIds, 'prof-1'),
    requiredUserId(userIds, 'prof-2'),
  ];
  const bookingDocuments = data.bookings.map(
    (booking: SeedBooking, index: number) => {
      const professorId = professorIds[index % professorIds.length];
      const equipmentId = equipmentIds.poa[index % equipmentIds.poa.length];
      const resourceKey =
        booking.type === 'aula'
          ? `professor:${String(professorId)}|equipment:${String(equipmentId)}`
          : `equipment:${String(equipmentId)}`;
      const [hours, minutes] = booking.time.split(':').map(Number);
      const occupiedSlots = [0, 30].map((offset) => {
        const total = hours * 60 + minutes + offset;
        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
      });
      return {
        _id: new Types.ObjectId(),
        legacyId: booking.id,
        studentId: requiredUserId(userIds, booking.userId),
        professorId: booking.type === 'aula' ? professorId : undefined,
        equipmentId,
        unitId: unitIds.poa,
        resourceKey,
        title: booking.title,
        date: booking.date,
        time: booking.time,
        durationMinutes: 60,
        type: booking.type,
        notes: booking.notes,
        status: booking.status,
        requestedBy: requiredUserId(userIds, booking.userId),
        activeSlotKey:
          booking.status === 'cancelado'
            ? undefined
            : `${String(unitIds.poa)}:${resourceKey}:${booking.date}:${booking.time}`,
        activeProfessorSlotKeys:
          booking.status === 'cancelado' || booking.type !== 'aula'
            ? undefined
            : occupiedSlots.map(
                (slot) =>
                  `${String(unitIds.poa)}:professor:${String(professorId)}:${booking.date}:${slot}`,
              ),
        activeEquipmentSlotKeys:
          booking.status === 'cancelado'
            ? undefined
            : occupiedSlots.map(
                (slot) =>
                  `${String(unitIds.poa)}:equipment:${String(equipmentId)}:${booking.date}:${slot}`,
              ),
        statusHistory: [
          {
            status: booking.status,
            changedBy:
              booking.status === 'pendente'
                ? requiredUserId(userIds, booking.userId)
                : adminId,
            changedAt: new Date(booking.createdAt),
          },
        ],
        createdAt: new Date(booking.createdAt),
        updatedAt: new Date(booking.createdAt),
      };
    },
  );
  await db.collection('bookings').insertMany(bookingDocuments);

  const categoryIds = new Map<string, Types.ObjectId>();
  await db.collection('materialcategories').insertMany(
    data.materialCategories.map((name) => {
      const _id = new Types.ObjectId();
      categoryIds.set(name, _id);
      return {
        _id,
        name,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),
  );

  const assetUrls = await migrateMaterialAssets(db, userIds);

  const materialDocuments = data.materials.map((material: SeedMaterial) => ({
    _id: new Types.ObjectId(),
    legacyId: material.id,
    title: material.title,
    description: material.description,
    categoryId: requiredCategoryId(categoryIds, material.category),
    coverImage: assetUrls.get(`${material.id}:cover`) ?? material.coverImage,
    body: material.body,
    attachments: material.attachments?.map((attachment) => ({
      _id: new Types.ObjectId(),
      legacyId: attachment.id,
      name: attachment.name,
      type: attachment.type,
      url: assetUrls.get(`${material.id}:${attachment.id}`) ?? attachment.url,
      size: attachment.size,
    })),
    authorId: requiredUserId(userIds, material.authorId),
    createdAt: new Date(material.createdAt),
    updatedAt: new Date(material.createdAt),
  }));
  await db.collection('materials').insertMany(materialDocuments);

  await createIndexes(db);
  const summary = {
    database: db.databaseName,
    users: await db.collection('users').countDocuments(),
    units: await db.collection('units').countDocuments(),
    equipments: await db.collection('equipment').countDocuments(),
    events: await db.collection('events').countDocuments(),
    bookings: await db.collection('bookings').countDocuments(),
    materials: await db.collection('materials').countDocuments(),
    materialCategories: await db
      .collection('materialcategories')
      .countDocuments(),
    storedFiles: await db.collection('storedfiles').countDocuments(),
  };
  console.log(JSON.stringify(summary));
  await mongoose.disconnect();
}

async function migrateMaterialAssets(
  db: NonNullable<typeof mongoose.connection.db>,
  userIds: Map<string, Types.ObjectId>,
) {
  const endpoint = new URL(requiredEnvironment('R2_ENDPOINT'));
  endpoint.pathname = '';
  endpoint.search = '';
  const bucket = requiredEnvironment('R2_BUCKET_NAME');
  const client = new S3Client({
    endpoint: endpoint.toString(),
    region: process.env.R2_REGION ?? 'auto',
    credentials: {
      accessKeyId: requiredEnvironment('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnvironment('R2_SECRET_ACCESS_KEY'),
    },
  });
  const sources = data.materials.flatMap((material: SeedMaterial) => [
    ...(material.coverImage
      ? [
          {
            mapKey: `${material.id}:cover`,
            purpose: 'material-cover',
            url: material.coverImage,
            name: `${material.id}-cover.jpg`,
            authorId: material.authorId,
          },
        ]
      : []),
    ...(material.attachments ?? []).map((attachment) => ({
      mapKey: `${material.id}:${attachment.id}`,
      purpose: 'material-attachment',
      url: attachment.url,
      name: attachment.name,
      authorId: material.authorId,
    })),
  ]);
  const mapped = new Map<string, string>();
  const documents: Record<string, unknown>[] = [];
  for (const source of sources) {
    const mapKey = source.mapKey;
    if (mapped.has(mapKey)) continue;
    const digest = createHash('sha256').update(mapKey).digest('hex');
    const id = new Types.ObjectId(digest.slice(0, 24));
    const safeName = source.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const key = `seed/${source.purpose}/${digest.slice(0, 20)}-${safeName}`;
    const response = await fetch(source.url);
    const isPdf = source.name.toLowerCase().endsWith('.pdf');
    const body = response.ok
      ? new Uint8Array(await response.arrayBuffer())
      : isPdf
        ? createSeedPdf(source.name)
        : createSeedImage(source.name);
    const mimeType = isPdf
      ? 'application/pdf'
      : response.ok
        ? (response.headers.get('content-type')?.split(';')[0] ??
          'application/octet-stream')
        : 'image/svg+xml';
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
        ContentLength: body.byteLength,
      }),
    );
    documents.push({
      _id: id,
      key,
      name: source.name,
      mimeType,
      size: body.byteLength,
      purpose: source.purpose,
      uploadedBy: requiredUserId(userIds, source.authorId),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mapped.set(mapKey, `/api/v1/files/${String(id)}`);
  }
  if (documents.length > 0)
    await db.collection('storedfiles').insertMany(documents);
  return mapped;
}

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurada.`);
  return value;
}

function createSeedPdf(title: string) {
  const safeTitle = title.replace(/[()\\]/g, '').replace(/[^\x20-\x7E]/g, '');
  const stream = `BT /F1 18 Tf 72 720 Td (${safeTitle}) Tj 0 -30 Td (Material de apoio DJ ON Academy) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'ascii'));
}

function createSeedImage(title: string) {
  const safeTitle = title.replace(/[<>&"']/g, '').replace(/[^\x20-\x7E]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0d1714"/><stop offset="1" stop-color="#29e58c"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="1270" cy="180" r="310" fill="#ffffff" opacity=".08"/><text x="100" y="405" fill="#ffffff" font-family="Arial,sans-serif" font-size="70" font-weight="700">DJ ON Academy</text><text x="100" y="500" fill="#ffffff" opacity=".7" font-family="Arial,sans-serif" font-size="34">${safeTitle}</text></svg>`;
  return new Uint8Array(Buffer.from(svg, 'utf8'));
}

function requiredUserId(map: Map<string, Types.ObjectId>, legacyId: string) {
  const id = map.get(legacyId);
  if (!id)
    throw new Error(`Usuário da carga inicial não encontrado: ${legacyId}`);
  return id;
}

function requiredCategoryId(map: Map<string, Types.ObjectId>, name: string) {
  const id = map.get(name);
  if (!id)
    throw new Error(`Categoria da carga inicial não encontrada: ${name}`);
  return id;
}

async function createIndexes(db: NonNullable<typeof mongoose.connection.db>) {
  await db
    .collection('users')
    .createIndexes([
      { key: { email: 1 }, unique: true },
      { key: { legacyId: 1 }, unique: true, sparse: true },
      { key: { name: 'text', email: 'text' } },
    ]);
  await db.collection('units').createIndex({ key: 1 }, { unique: true });
  await db
    .collection('equipment')
    .createIndex({ unitId: 1, name: 1 }, { unique: true });
  await db
    .collection('events')
    .createIndexes([
      { key: { legacyId: 1 }, unique: true, sparse: true },
      { key: { title: 'text', location: 'text', description: 'text' } },
    ]);
  await db.collection('bookings').createIndexes([
    { key: { legacyId: 1 }, unique: true, sparse: true },
    { key: { activeSlotKey: 1 }, unique: true, sparse: true },
    {
      key: { activeProfessorSlotKeys: 1 },
      unique: true,
      sparse: true,
    },
    {
      key: { activeEquipmentSlotKeys: 1 },
      unique: true,
      sparse: true,
    },
  ]);
  await db
    .collection('materialcategories')
    .createIndex({ name: 1 }, { unique: true });
  await db
    .collection('materials')
    .createIndexes([
      { key: { legacyId: 1 }, unique: true, sparse: true },
      { key: { title: 'text', description: 'text', body: 'text' } },
    ]);
  await db.collection('storedfiles').createIndex({ key: 1 }, { unique: true });
}

void seed().catch(async (error: unknown) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
