import { PartialType } from '@nestjs/swagger';
import { CreateProcessInput } from './create-process-input.dto';

export class UpdateProcessInput extends PartialType(CreateProcessInput) {}
