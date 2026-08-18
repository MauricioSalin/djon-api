import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => this.normalize(data)));
  }

  private normalize(data: unknown): unknown {
    if (data === undefined || data === null) return data;

    const plain = JSON.parse(JSON.stringify(data)) as unknown;
    return this.renameMongoIds(plain);
  }

  private renameMongoIds(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.renameMongoIds(item));
    }
    if (typeof value !== 'object' || value === null) return value;

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    if (source.id === undefined && typeof source._id === 'string') {
      result.id = source._id;
    }
    for (const [key, nested] of Object.entries(source)) {
      if (key === '_id' || key === '__v') continue;
      result[key] = this.renameMongoIds(nested);
    }
    return result;
  }
}
