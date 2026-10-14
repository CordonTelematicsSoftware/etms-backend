import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
// import { RoutesClient } from '@googlemaps/routing';

@Injectable()
export class GoogleMapsService {
  private logger = new Logger(GoogleMapsService.name);
  constructor(private config: ConfigService) {}

  private readonly googleMapsApiKey = `${this.config.get('GOOGLE_MAPS_TOKEN')}`;
  private readonly distanceMatrixUrl =
    'https://maps.googleapis.com/maps/api/distancematrix/json';

  private readonly mapDirectionsUrl =
    'https://maps.googleapis.com/maps/api/directions/json';

  async getDistance(origin: string, destination: string): Promise<any> {
    try {
      const response = await axios.get(this.distanceMatrixUrl, {
        params: {
          origins: origin, // Format: "lat,lng"
          destinations: destination, // Format: "lat,lng"
          key: this.googleMapsApiKey,
        },
      });
      const elements = response.data.rows?.[0]?.elements?.[0];

      if (!elements || elements.status !== 'OK') {
        throw new Error('Invalid response from Google Maps API');
      }

      const distance = elements.distance.text; // e.g., "15.0 km"
      const time = elements.duration.text; // e.g., "38 mins"

      return { distance, time };
    } catch (error) {
      const errorMessage =
        error?.response?.data?.error_message ||
        error?.message ||
        'Google Maps API request failed';
      const statusCode =
        error?.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;

      throw new HttpException(errorMessage, statusCode);
    }
  }

  async calculateCabRoute(origin, destination, waypoints = []): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion

    // this.logger.error('------------origin--------------------------', origin);
    // this.logger.error(
    //   '------------destination--------------------------',
    //   destination,
    // );
    // this.logger.error(
    //   '------------waypoints--------------------------',
    //   waypoints,
    // );

    if (!origin || !destination) {
      throw new BadRequestException(
        `Missing required parameters, origin and destination.`,
      );
    }

    const waypointStr = waypoints?.join('|');
    try {
      const response = await axios.get(this.mapDirectionsUrl, {
        params: {
          origin: origin, // Format: "lat,lng"
          destination: destination, // Format: "lat,lng"
          waypoints: waypointStr, // Format: "lat,lng|lat,lng"
          key: this.googleMapsApiKey,
        },
      });

      let totalDistance = 0;
      let totalDuration = 0;
      const data = response.data;

      const legs = data.routes?.[0]?.legs?.map((leg, idx) => {
        totalDistance += leg.distance.value;
        totalDuration += leg.duration.value;

        return {
          legNumber: idx + 1,
          from: leg.start_address,
          to: leg.end_address,
          distance: leg.distance.text,
          duration: leg.duration.text,
        };
      });

      return {
        totalDistanceKm: (totalDistance / 1000).toFixed(2),
        totalDurationMin: Math.round(totalDuration / 60).toString(),
        legs,
      };
    } catch (err) {
      throw err;
    }
  }

  private toRad(x: number): number {
    return (x * Math.PI) / 180;
  }

  async haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): Promise<number> {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Promise.resolve(R * c);
  }
}
// const routingClient = new RoutesClient({
//   apiKey: 'AIzaSyA_ohxskcnH3WF82pnxVZ5kkC2Qei-GAyA',
// });
// const request = {
//   origin: {
//     location: {
//       latLng: {
//         latitude: 37.419734,
//         longitude: -122.0827784,
//       },
//     },
//   },
//   destination: {
//     location: {
//       latLng: {
//         latitude: 37.41767,
//         longitude: -122.079595,
//       },
//     },
//   },
// };
// console.log('request  >>>  ', request);
// Run request
// const response = await routingClient.computeRoutes(request);

// const data = response;
// if (data.status !== 'OK') {
//   throw new HttpException(
//     data.error_message || 'Error fetching distance',
//     HttpStatus.BAD_REQUEST,
//   );
// }

// return {
//   distance: data.rows[0].elements[0].distance.text, // e.g., "10 km"
//   duration: data.rows[0].elements[0].duration.text, // e.g., "15 mins"
// };
