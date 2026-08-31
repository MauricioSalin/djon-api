import { ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { Permission } from '../../common/enums/permission.enum';

export class UpdatePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsEnum(Permission, { each: true })
  permissions!: Permission[];
}
