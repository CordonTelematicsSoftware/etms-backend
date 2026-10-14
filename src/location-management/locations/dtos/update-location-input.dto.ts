import { PartialType } from '@nestjs/swagger';
import { CreateLocationInput } from './create-location-input.dto';

export class UpdateLocationInput extends PartialType(CreateLocationInput) {}
