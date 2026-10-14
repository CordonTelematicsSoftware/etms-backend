import { Module } from '@nestjs/common';
import { GoogleMapsService } from './services/google-map-service';
import { GoogleMapsController } from './controller/google-map-controller';

@Module({
  controllers: [GoogleMapsController],
  providers: [GoogleMapsService],
  exports: [GoogleMapsService],
})
export class GoogleMapModule {}
