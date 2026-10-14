import { PartialType } from '@nestjs/swagger';
import { CreateSecurityInput } from './create-security-input.dto';

export class UpdateSecurityInput extends PartialType(CreateSecurityInput) {}
