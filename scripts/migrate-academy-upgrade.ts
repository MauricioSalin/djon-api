import 'dotenv/config';
import { MongoClient } from 'mongodb';

function requiredMongoUri() {
  const value = process.env.MONGODB_URI;
  if (!value) throw new Error('MONGODB_URI não configurada.');
  return value;
}

async function migrate() {
  const client = new MongoClient(requiredMongoUri());
  await client.connect();
  try {
    const db = client.db();
    const categoryCollection = db.collection('materialcategories');
    const currentCoursesCategory = await categoryCollection.findOne({
      $or: [{ systemKey: 'courses' }, { name: 'Cursos' }],
    });
    const coursesCategoryId = currentCoursesCategory
      ? currentCoursesCategory._id
      : (
          await categoryCollection.insertOne({
            name: 'Cursos',
            active: true,
            type: 'curso',
            systemKey: 'courses',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ).insertedId;
    await categoryCollection.updateOne(
      { _id: coursesCategoryId },
      {
        $set: {
          name: 'Cursos',
          active: true,
          type: 'curso',
          systemKey: 'courses',
          updatedAt: new Date(),
        },
      },
    );
    const defaultStudentUnit =
      (await db.collection('units').findOne({ key: 'poa', active: true })) ??
      (await db.collection('units').findOne({ active: true }));
    if (!defaultStudentUnit) {
      throw new Error(
        'Nenhuma unidade ativa encontrada para os alunos legados.',
      );
    }
    const [
      students,
      legacyStudentUnits,
      permissions,
      progress,
      passwords,
      equipment,
      categories,
      courses,
      courseMaterials,
      legacyCourseCategories,
    ] = await Promise.all([
      db.collection('users').updateMany(
        {
          role: 'student',
          $or: [
            { trainingHoursLimit: { $exists: false } },
            { trainingHoursLimit: 8 },
          ],
        },
        { $set: { trainingHoursLimit: 15 } },
      ),
      db.collection('users').updateMany(
        {
          role: 'student',
          $or: [{ unitId: { $exists: false } }, { unitId: null }],
        },
        { $set: { unitId: defaultStudentUnit._id } },
      ),
      db
        .collection('users')
        .updateMany(
          { permissions: { $exists: false } },
          { $set: { permissions: [] } },
        ),
      db
        .collection('users')
        .updateMany(
          { showAcademicProgress: { $exists: false } },
          { $set: { showAcademicProgress: true } },
        ),
      db
        .collection('users')
        .updateMany(
          { passwordChangeRequired: { $exists: false } },
          { $set: { passwordChangeRequired: false } },
        ),
      db
        .collection('equipment')
        .updateMany(
          { unavailableWeekdays: { $exists: false } },
          { $set: { unavailableWeekdays: [] } },
        ),
      db
        .collection('materialcategories')
        .updateMany(
          { type: { $exists: false } },
          { $set: { type: 'biblioteca' } },
        ),
      db
        .collection('courses')
        .updateMany(
          { categoryId: { $ne: coursesCategoryId } },
          { $set: { categoryId: coursesCategoryId } },
        ),
      db.collection('materials').updateMany(
        {
          courseId: { $exists: true, $ne: null },
          categoryId: { $ne: coursesCategoryId },
        },
        { $set: { categoryId: coursesCategoryId } },
      ),
      categoryCollection.updateMany(
        { _id: { $ne: coursesCategoryId }, type: 'curso' },
        { $set: { active: false, updatedAt: new Date() } },
      ),
    ]);
    const cohortNames = new Map(
      (
        await db
          .collection('cohorts')
          .find({}, { projection: { name: 1 } })
          .toArray()
      ).map((cohort) => [String(cohort._id), String(cohort.name ?? 'Turma')]),
    );
    const lessonBookings = await db
      .collection('lessons')
      .find({}, { projection: { bookingId: 1, cohortId: 1 } })
      .toArray();
    const classBookingResult = lessonBookings.length
      ? await db.collection('bookings').bulkWrite(
          lessonBookings.map((lesson) => ({
            updateOne: {
              filter: { _id: lesson.bookingId },
              update: {
                $set: {
                  isClassLesson: true,
                  cohortId: lesson.cohortId,
                  cohortName:
                    cohortNames.get(String(lesson.cohortId)) ?? 'Turma',
                  lessonId: lesson._id,
                  updatedAt: new Date(),
                },
              },
            },
          })),
        )
      : null;
    console.log(
      JSON.stringify({
        studentsUpdated: students.modifiedCount,
        legacyStudentUnitsUpdated: legacyStudentUnits.modifiedCount,
        permissionsUpdated: permissions.modifiedCount,
        progressVisibilityUpdated: progress.modifiedCount,
        passwordFlagsUpdated: passwords.modifiedCount,
        equipmentUpdated: equipment.modifiedCount,
        categoriesUpdated: categories.modifiedCount,
        coursesUpdated: courses.modifiedCount,
        courseMaterialsUpdated: courseMaterials.modifiedCount,
        legacyCourseCategoriesDisabled: legacyCourseCategories.modifiedCount,
        classBookingsUpdated: classBookingResult?.modifiedCount ?? 0,
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
