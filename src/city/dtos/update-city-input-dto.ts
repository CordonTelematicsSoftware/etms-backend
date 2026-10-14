import { PartialType } from '@nestjs/swagger';
import { CreateCityInput } from './create-city-input-dto';

export class UpdateCityInput extends PartialType(CreateCityInput) {}
