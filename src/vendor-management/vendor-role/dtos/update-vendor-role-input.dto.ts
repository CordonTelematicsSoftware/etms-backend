import { PartialType } from '@nestjs/swagger';
import { CreateVendorRoleInput } from './create-vendor-role-input.dto';

export class UpdateVendorRoleInput extends PartialType(CreateVendorRoleInput) {}
