// src/shared/secrets/secrets-manager.service.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

@Injectable()
export class SecretsManagerService {
  private readonly logger = new Logger(SecretsManagerService.name);
  private readonly client = new SecretsManagerClient({
    region: process.env.AWSREGION ?? process.env.AWS_REGION,
    credentials: {
      accessKeyId: requireEnv('AWSACCESSKEYID'),
      secretAccessKey: requireEnv('AWSSECRETACCESSKEY'),
    },
  });

  // in-memory cache so warm Lambda invocations / same process don't refetch every time
  private cache = new Map<string, { value: any; fetchedAt: number }>();
  private readonly ttlMs = 10 * 60 * 1000; // 10 min

  async getJsonSecret<T = any>(secretName: string): Promise<T> {
    const cached = this.cache.get(secretName);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      return cached.value as T;
    }

    let response;
    try {
      response = await this.client.send(
        new GetSecretValueCommand({
          SecretId: secretName,
          VersionStage: 'AWSCURRENT',
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch secret "${secretName}"`,
        error as Error,
      );
      throw error;
    }

    if (!response.SecretString) {
      throw new Error(`Secret "${secretName}" has no SecretString payload`);
    }

    const value = JSON.parse(response.SecretString) as T;
    this.cache.set(secretName, { value, fetchedAt: Date.now() });
    return value;
  }
}
