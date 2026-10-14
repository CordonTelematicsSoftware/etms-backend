import { PartialType } from '@nestjs/swagger';
import { CreateCabInput } from './create-cab-input.dto';

export class UpdateCabInput extends PartialType(CreateCabInput) {}
