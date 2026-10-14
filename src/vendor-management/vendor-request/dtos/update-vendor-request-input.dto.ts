import { PartialType } from '@nestjs/swagger';
import { CreateVendorRequestInput } from './create-vendor-request-input.dto';

export class UpdateVendorRequestInput extends PartialType(
  CreateVendorRequestInput,
) {}
