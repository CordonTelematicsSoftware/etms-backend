import { PartialType } from '@nestjs/swagger';
import { CreateAdminInput } from './create-administrator-input.dto';

export class UpdateAdministratorInput extends PartialType(CreateAdminInput) {}
