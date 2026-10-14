import { PartialType } from '@nestjs/swagger';
import { CreateVendorUserInput } from './create-vendor-user-input.dto';

export class UpdateVendorUserInput extends PartialType(CreateVendorUserInput) {}
