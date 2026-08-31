import { Permission } from '../enums/permission.enum';
import { Role } from '../enums/role.enum';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  unitId?: string;
  permissions?: Permission[];
}
