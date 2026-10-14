import { PartialType } from '@nestjs/swagger';
import { CreateReportSchedulerDto } from './create-report-scheduler-input.dto';

export class UpdateReportSchedulerInput extends PartialType(
  CreateReportSchedulerDto,
) {}
