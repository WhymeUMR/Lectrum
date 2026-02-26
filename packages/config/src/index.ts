import { DynamicModule, Global, Module } from '@nestjs/common';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  REDIS_URL: z.string().url(),
  DATABASE_URL: z.string().min(1).optional()
});

export type AppEnv = z.infer<typeof EnvSchema>;
export const APP_ENV = Symbol('APP_ENV');

function loadEnv(serviceName: string): AppEnv {
  return EnvSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    SERVICE_NAME: process.env.SERVICE_NAME ?? serviceName,
    PORT: process.env.PORT,
    REDIS_URL: process.env.REDIS_URL,
    DATABASE_URL: process.env.DATABASE_URL
  });
}

@Global()
@Module({})
export class SharedConfigModule {
  static forRoot(serviceName: string): DynamicModule {
    return {
      module: SharedConfigModule,
      providers: [
        {
          provide: APP_ENV,
          useFactory: () => loadEnv(serviceName)
        }
      ],
      exports: [APP_ENV]
    };
  }
}
