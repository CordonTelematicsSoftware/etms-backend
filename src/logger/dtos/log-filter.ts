import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { ListOptionInput } from 'src/shared/dtos/filter.input';
export class LogFilterDto extends ListOptionInput {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  fromDate: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  toDate: Date;
}
