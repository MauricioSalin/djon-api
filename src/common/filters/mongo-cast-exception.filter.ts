import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { Error as MongooseError } from 'mongoose';

@Catch(MongooseError.CastError)
export class MongoCastExceptionFilter implements ExceptionFilter {
  catch(_error: MongooseError.CastError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Identificador inválido.',
    });
  }
}
