import { PartialType } from '@nestjs/swagger';
import { CreateCompanyConfigInput } from './create-company-config-input.dto';

export class UpdateCompanyConfigInput extends PartialType(
  CreateCompanyConfigInput,
) {}
