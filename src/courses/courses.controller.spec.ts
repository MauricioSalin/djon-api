import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CoursesController } from './courses.controller';

type CourseControllerMethod =
  | 'createCourse'
  | 'updateCourse'
  | 'deleteCourse'
  | 'updateCohort'
  | 'deleteCohort'
  | 'findStudentObservations';

function handler(method: CourseControllerMethod): object {
  const value: unknown = Object.getOwnPropertyDescriptor(
    CoursesController.prototype,
    method,
  )?.value;
  if (typeof value !== 'function') throw new Error(`Método ${method} ausente.`);
  return value;
}

describe('CoursesController - autorização', () => {
  it.each([
    'createCourse',
    'updateCourse',
    'deleteCourse',
    'updateCohort',
    'deleteCohort',
  ] as const)(
    'permite %s para admin e professor sem permissão delegada',
    (method) => {
      expect(Reflect.getMetadata(ROLES_KEY, handler(method))).toEqual([
        Role.Admin,
        Role.Professor,
      ]);
      expect(
        Reflect.getMetadata(PERMISSIONS_KEY, handler(method)),
      ).toBeUndefined();
    },
  );

  it('restringe a consulta de observações a professores', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, handler('findStudentObservations')),
    ).toEqual([Role.Admin, Role.Professor]);
  });
});
