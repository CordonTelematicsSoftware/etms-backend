import { PartialType } from '@nestjs/swagger';
import { CreateTeamInput } from './create-team-input.dto';

export class UpdateTeamInput extends PartialType(CreateTeamInput) {}
