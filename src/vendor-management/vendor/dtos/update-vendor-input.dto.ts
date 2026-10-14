import { PartialType } from '@nestjs/swagger';
import { CreateVendorInput } from './create-vendor-input.dto';

export class UpdateVendorInput extends PartialType(CreateVendorInput) {}
