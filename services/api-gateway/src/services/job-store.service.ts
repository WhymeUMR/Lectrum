import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { APP_ENV, AppEnv } from '@lecture/config';
import { PipelineRepository } from '@lecture/pipeline';

@Injectable()
export class JobStoreService implements OnModuleInit, OnModuleDestroy {
  readonly repo: PipelineRepository;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for api-gateway');
    }
    this.repo = PipelineRepository.fromDatabaseUrl(env.DATABASE_URL);
  }

  async onModuleInit(): Promise<void> {
    await this.repo.ensureSchema();
  }

  async onModuleDestroy(): Promise<void> {
    await this.repo.close();
  }
}
