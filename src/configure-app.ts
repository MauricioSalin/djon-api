import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';
import { MongoCastExceptionFilter } from './common/filters/mongo-cast-exception.filter';

export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const prefix = config.get<string>('API_PREFIX', 'api/v1');
  const configuredOrigins = new Set(
    config
      .get<string>('CORS_ORIGINS', 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim()),
  );
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  app.setGlobalPrefix(prefix);
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      const localDevelopmentOrigin =
        !isProduction &&
        Boolean(
          origin?.match(
            /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/,
          ),
        );
      if (!origin || configuredOrigins.has(origin) || localDevelopmentOrigin) {
        callback(null, true);
        return;
      }
      callback(new Error('Origem não permitida pelo CORS.'));
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalFilters(new MongoCastExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('DJ ON API')
    .setDescription('API do portal DJ ON Academy')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () =>
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  return app;
}
