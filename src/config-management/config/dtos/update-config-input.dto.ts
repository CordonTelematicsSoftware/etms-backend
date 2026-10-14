import { PartialType } from '@nestjs/swagger';
import { CreateConfigInput } from './create-config-input.dto';

export class UpdateConfigInput extends PartialType(CreateConfigInput) {}
