import { Module } from '@nestjs/common';
import { CordonGpsAuthService } from './services/cordon-gps-auth.service';
import { CordonGpsApiService } from './services/cordon-gps-api.service';
import { ConfigurationModule } from 'src/config-management/config/config.module';

@Module({
  imports: [ConfigurationModule],
  providers: [CordonGpsAuthService, CordonGpsApiService],
  exports: [CordonGpsApiService],
})
export class CordonGpsModule {}
