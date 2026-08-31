import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Model, Types } from 'mongoose';
import { Role } from '../common/enums/role.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { fileLimitForPurpose, MEGABYTE } from './files.constants';
import { StoredFile, StoredFileDocument } from './schemas/stored-file.schema';

const PURPOSES = new Set([
  'avatar',
  'banner',
  'latest-release-cover',
  'material-cover',
  'material-attachment',
  'rich-text',
  'other',
]);

const IMAGE_PURPOSES = new Set([
  'avatar',
  'banner',
  'latest-release-cover',
  'material-cover',
  'rich-text',
]);

@Injectable()
export class FilesService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    @InjectModel(StoredFile.name)
    private readonly fileModel: Model<StoredFileDocument>,
    config: ConfigService,
  ) {
    const rawEndpoint = config.getOrThrow<string>('R2_ENDPOINT');
    const endpoint = new URL(rawEndpoint);
    endpoint.pathname = '';
    endpoint.search = '';
    endpoint.hash = '';
    this.bucket = config.getOrThrow<string>('R2_BUCKET_NAME');
    this.client = new S3Client({
      endpoint: endpoint.toString(),
      region: config.get<string>('R2_REGION', 'auto'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  async upload(
    file: Express.Multer.File | undefined,
    actor: AuthUser,
    purpose = 'other',
  ) {
    if (!file) throw new BadRequestException('Arquivo não enviado.');
    if (!PURPOSES.has(purpose)) {
      throw new BadRequestException('Finalidade de arquivo inválida.');
    }
    const fileLimit = fileLimitForPurpose(purpose);
    if (file.size > fileLimit) {
      throw new BadRequestException(
        `O arquivo excede o limite de ${fileLimit / MEGABYTE} MB.`,
      );
    }
    if (IMAGE_PURPOSES.has(purpose) && !file.mimetype.startsWith('image/')) {
      throw new BadRequestException(
        'Esta finalidade aceita somente arquivos de imagem.',
      );
    }
    if (
      purpose === 'material-attachment' &&
      file.mimetype.startsWith('video/')
    ) {
      throw new BadRequestException(
        'Vídeos de materiais devem ser incorporados por um link do YouTube.',
      );
    }
    const safeName = file.originalname
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(-120);
    const key = `${purpose}/${actor.id}/${randomUUID()}-${safeName || 'arquivo'}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
        Metadata: { uploadedBy: actor.id, purpose },
      }),
    );
    try {
      const stored = await this.fileModel.create({
        key,
        name: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        purpose,
        uploadedBy: new Types.ObjectId(actor.id),
      });
      return this.response(stored);
    } catch (error) {
      await this.client
        .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
        .catch(() => undefined);
      throw error;
    }
  }

  async find(id: string) {
    const file = await this.fileModel.findById(id).lean().exec();
    if (!file) throw new NotFoundException('Arquivo não encontrado.');
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: file.key }),
    );
    if (!object.Body) throw new NotFoundException('Arquivo não encontrado.');
    return { file, stream: object.Body as Readable };
  }

  async remove(id: string, actor: AuthUser) {
    const file = await this.fileModel.findById(id).exec();
    if (!file) throw new NotFoundException('Arquivo não encontrado.');
    if (actor.role !== Role.Admin && String(file.uploadedBy) !== actor.id) {
      throw new ForbiddenException('Arquivo pertence a outro usuário.');
    }
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: file.key }),
    );
    await file.deleteOne();
    return { id, removed: true };
  }

  extractFileIds(values: unknown[]): Set<string> {
    const ids = new Set<string>();
    const serialized = JSON.stringify(values);
    const pattern = /\/api\/v1\/files\/([a-f\d]{24})(?:[?"'\\/]|$)/gi;
    for (const match of serialized.matchAll(pattern)) ids.add(match[1]);
    return ids;
  }

  async removeFileIds(ids: Iterable<string>) {
    const results = await Promise.allSettled(
      [...new Set(ids)].map((id) => this.removeInternal(id)),
    );
    return {
      removed: results.filter((result) => result.status === 'fulfilled').length,
      failed: results.filter((result) => result.status === 'rejected').length,
    };
  }

  private async removeInternal(id: string) {
    if (!Types.ObjectId.isValid(id)) return;
    const file = await this.fileModel.findById(id).exec();
    if (!file) return;
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: file.key }),
    );
    await file.deleteOne();
  }

  private response(file: StoredFileDocument) {
    return {
      id: String(file.id),
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      purpose: file.purpose,
      url: `/api/v1/files/${String(file.id)}`,
    };
  }
}
