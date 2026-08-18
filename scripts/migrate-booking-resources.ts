import 'dotenv/config';
import {
  type AnyBulkWriteOperation,
  type Document,
  MongoClient,
  ObjectId,
} from 'mongodb';

type BookingRecord = {
  _id: ObjectId;
  date: string;
  time: string;
  durationMinutes?: number;
  type: 'aula' | 'treino';
  status: 'confirmado' | 'pendente' | 'cancelado';
  unitId: ObjectId;
  professorId?: ObjectId;
  equipmentId?: ObjectId;
};

type EquipmentRecord = {
  _id: ObjectId;
  unitId: ObjectId;
  active: boolean;
};

function requiredMongoUri() {
  const value = process.env.MONGODB_URI;
  if (!value) throw new Error('MONGODB_URI não configurada.');
  return value;
}

function slotTimes(time: string, durationMinutes = 60) {
  const [hours, minutes] = time.split(':').map(Number);
  const start = hours * 60 + minutes;
  const slots: string[] = [];
  for (let offset = 0; offset < durationMinutes; offset += 30) {
    const total = start + offset;
    slots.push(
      `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`,
    );
  }
  return slots;
}

async function migrate() {
  const client = new MongoClient(requiredMongoUri());
  await client.connect();
  try {
    const db = client.db();
    const bookings = (await db
      .collection<BookingRecord>('bookings')
      .find({})
      .sort({ date: 1, time: 1, createdAt: 1 })
      .toArray()) as BookingRecord[];
    const equipments = (await db
      .collection<EquipmentRecord>('equipment')
      .find({ active: true })
      .sort({ name: 1 })
      .toArray()) as EquipmentRecord[];
    const equipmentByUnit = new Map<string, EquipmentRecord[]>();
    for (const equipment of equipments) {
      const unitId = String(equipment.unitId);
      equipmentByUnit.set(unitId, [
        ...(equipmentByUnit.get(unitId) ?? []),
        equipment,
      ]);
    }

    const occupiedProfessor = new Set<string>();
    const occupiedEquipment = new Set<string>();
    const operations: AnyBulkWriteOperation<Document>[] = [];
    let assignedEquipment = 0;

    for (const booking of bookings) {
      if (booking.status === 'cancelado') {
        operations.push({
          updateOne: {
            filter: { _id: booking._id },
            update: {
              $unset: {
                activeSlotKey: '',
                activeProfessorSlotKeys: '',
                activeEquipmentSlotKeys: '',
              },
            },
          },
        });
        continue;
      }

      const unitId = String(booking.unitId);
      const slots = slotTimes(booking.time, booking.durationMinutes ?? 60);
      const professorKeys =
        booking.type === 'aula' && booking.professorId
          ? slots.map(
              (slot) =>
                `${unitId}:professor:${String(booking.professorId)}:${booking.date}:${slot}`,
            )
          : [];
      if (professorKeys.some((key) => occupiedProfessor.has(key))) {
        throw new Error(
          `Conflito preexistente de professor no agendamento ${String(booking._id)}.`,
        );
      }

      const candidates = booking.equipmentId
        ? (equipmentByUnit.get(unitId) ?? []).filter(
            (equipment) =>
              String(equipment._id) === String(booking.equipmentId),
          )
        : (equipmentByUnit.get(unitId) ?? []);
      const equipment = candidates.find((candidate) =>
        slots.every(
          (slot) =>
            !occupiedEquipment.has(
              `${unitId}:equipment:${String(candidate._id)}:${booking.date}:${slot}`,
            ),
        ),
      );
      if (!equipment) {
        throw new Error(
          `Nenhum equipamento livre para migrar o agendamento ${String(booking._id)}.`,
        );
      }
      if (!booking.equipmentId) assignedEquipment += 1;

      const equipmentKeys = slots.map(
        (slot) =>
          `${unitId}:equipment:${String(equipment._id)}:${booking.date}:${slot}`,
      );
      professorKeys.forEach((key) => occupiedProfessor.add(key));
      equipmentKeys.forEach((key) => occupiedEquipment.add(key));
      const resourceKey = booking.professorId
        ? `professor:${String(booking.professorId)}|equipment:${String(equipment._id)}`
        : `equipment:${String(equipment._id)}`;

      operations.push({
        updateOne: {
          filter: { _id: booking._id },
          update: {
            $set: {
              equipmentId: equipment._id,
              resourceKey,
              activeSlotKey: `${unitId}:${resourceKey}:${booking.date}:${booking.time}`,
              activeEquipmentSlotKeys: equipmentKeys,
              ...(professorKeys.length > 0
                ? { activeProfessorSlotKeys: professorKeys }
                : {}),
            },
            ...(professorKeys.length === 0
              ? { $unset: { activeProfessorSlotKeys: '' } }
              : {}),
          },
        },
      });
    }

    if (operations.length > 0) {
      await db.collection('bookings').bulkWrite(operations, { ordered: true });
    }
    console.log(
      JSON.stringify({
        inspected: bookings.length,
        migrated: operations.length,
        assignedEquipment,
      }),
    );
  } finally {
    await client.close();
  }
}

void migrate().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
