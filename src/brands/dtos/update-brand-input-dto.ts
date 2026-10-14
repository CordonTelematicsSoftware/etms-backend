import { PartialType } from '@nestjs/swagger';
import { CreateBrandInput } from './create-brand-input-dto';

export class UpdateBrandInput extends PartialType(CreateBrandInput) {}
