import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Body,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { MATERIAL_ATTACHMENT_LIMIT_BYTES } from './files.constants';
import { FilesService } from './files.service';

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
]);

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MATERIAL_ATTACHMENT_LIMIT_BYTES },
      fileFilter: (_request, file, callback) =>
        callback(
          allowedMimeTypes.has(file.mimetype)
            ? null
            : new BadRequestException('Tipo de arquivo não permitido.'),
          allowedMimeTypes.has(file.mimetype),
        ),
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthUser,
    @Body('purpose') purpose?: string,
  ) {
    return this.filesService.upload(file, actor, purpose);
  }

  @Public()
  @Get(':id')
  async download(@Param('id') id: string, @Res() response: Response) {
    const { file, stream } = await this.filesService.find(id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    stream.pipe(response);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.filesService.remove(id, actor);
  }
}
