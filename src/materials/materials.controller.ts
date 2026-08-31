import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Permission } from '../common/enums/permission.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { CategoryDto, DeleteCategoryDto } from './dto/category.dto';
import { CreateMaterialDto } from './dto/create-material.dto';
import { QueryMaterialsDto } from './dto/query-materials.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { MaterialsService } from './materials.service';

@ApiTags('materials')
@ApiBearerAuth()
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @Permissions(Permission.MaterialsManage)
  create(@Body() dto: CreateMaterialDto, @CurrentUser() actor: AuthUser) {
    return this.materialsService.create(dto, actor);
  }

  @Get()
  findAll(@Query() query: QueryMaterialsDto, @CurrentUser() actor: AuthUser) {
    return this.materialsService.findAll(query, actor);
  }

  @Get('categories')
  findCategories() {
    return this.materialsService.findCategories();
  }

  @Post('categories')
  @Permissions(Permission.MaterialsManage)
  createCategory(@Body() dto: CategoryDto) {
    return this.materialsService.createCategory(dto.name, dto.type);
  }

  @Patch('categories/:id')
  @Permissions(Permission.MaterialsManage)
  updateCategory(@Param('id') id: string, @Body() dto: CategoryDto) {
    return this.materialsService.updateCategory(id, dto.name);
  }

  @Delete('categories/:id')
  @Permissions(Permission.MaterialsManage)
  deleteCategory(@Param('id') id: string, @Body() dto: DeleteCategoryDto) {
    return this.materialsService.deleteCategory(id, dto.transferToCategoryId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.materialsService.findOne(id, actor);
  }

  @Patch(':id')
  @Permissions(Permission.MaterialsManage)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.materialsService.update(id, dto, actor);
  }

  @Delete(':id')
  @Permissions(Permission.MaterialsManage)
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.materialsService.remove(id, actor);
  }
}
