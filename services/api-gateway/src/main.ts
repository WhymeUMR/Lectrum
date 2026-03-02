import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { APP_ENV, AppEnv } from '@lecture/config';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { enhanceOpenApiDocument } from './swagger/openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.useGlobalFilters(new GlobalExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Lecture to Flashcards API')
    .setDescription(
      'Полная документация API для загрузки лекций, обработки, ассистента, тестов и авторизации.'
    )
    .setVersion('1.0.0')
    .build();
  const baseDocument = SwaggerModule.createDocument(app, swaggerConfig);
  const swaggerDocument = enhanceOpenApiDocument(baseDocument);
  SwaggerModule.setup('docs', app, swaggerDocument, {
    jsonDocumentUrl: 'docs-json',
    customSiteTitle: 'Lecture API Docs'
  });

  const env = app.get<AppEnv>(APP_ENV);
  await app.listen(env.PORT, '0.0.0.0');
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
