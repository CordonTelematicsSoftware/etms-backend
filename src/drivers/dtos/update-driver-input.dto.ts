import { PartialType } from '@nestjs/swagger';
import { CreateDriverInput } from './create-driver-input.dto';

export class UpdateDriverInput extends PartialType(CreateDriverInput) {}
