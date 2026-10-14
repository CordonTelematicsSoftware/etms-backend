import { PartialType } from '@nestjs/swagger';
import { CreateAdminInput } from './create-admin-input.dto';

export class UpdateAdminInput extends PartialType(CreateAdminInput) {}
