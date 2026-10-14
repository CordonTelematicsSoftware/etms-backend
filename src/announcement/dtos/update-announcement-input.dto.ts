import { PartialType } from '@nestjs/swagger';
import { CreateAnnouncementInput } from './create-announcement-input.dto';

export class UpdateAnnouncementInput extends PartialType(
  CreateAnnouncementInput,
) {}
