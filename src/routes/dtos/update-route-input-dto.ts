import { PartialType } from '@nestjs/swagger';
import { CreateRouteInput } from './create-route-input-dto';

export class UpdateRouteInput extends PartialType(CreateRouteInput) {}
