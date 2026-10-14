import { PartialType } from '@nestjs/swagger';
import { CreateCommonPointInput } from './create-commonPoint-input.dto';

export class UpdateCommonPointInput extends PartialType(
  CreateCommonPointInput,
) {}
