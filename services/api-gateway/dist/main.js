"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const config_1 = require("@lecture/config");
const global_exception_filter_1 = require("./filters/global-exception.filter");
const openapi_1 = require("./swagger/openapi");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableShutdownHooks();
    app.useGlobalFilters(new global_exception_filter_1.GlobalExceptionFilter());
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Lecture to Flashcards API')
        .setDescription('Полная документация API для загрузки лекций, обработки, ассистента, тестов и авторизации.')
        .setVersion('1.0.0')
        .build();
    const baseDocument = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    const swaggerDocument = (0, openapi_1.enhanceOpenApiDocument)(baseDocument);
    swagger_1.SwaggerModule.setup('docs', app, swaggerDocument, {
        jsonDocumentUrl: 'docs-json',
        customSiteTitle: 'Lecture API Docs'
    });
    const env = app.get(config_1.APP_ENV);
    await app.listen(env.PORT, '0.0.0.0');
}
bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=main.js.map