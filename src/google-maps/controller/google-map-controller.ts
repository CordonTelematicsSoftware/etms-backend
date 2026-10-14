import { Controller, Get, Query } from '@nestjs/common';
import { GoogleMapsService } from '../services/google-map-service';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('google-maps')
export class GoogleMapsController {
  constructor(private readonly googleMapsService: GoogleMapsService) {}

  @Get('distance')
  @Public()
  async getDistance(
    @Query('destination') destination: string,
    @Query('origin') origin: string,
  ) {
    return this.googleMapsService.getDistance(origin, destination);
  }
}
