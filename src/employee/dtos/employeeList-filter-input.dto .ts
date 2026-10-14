import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn } from 'class-validator';
import { SortOrder } from 'src/shared/enums';

export class EmployeeListFilterInput {
  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  sortBy: string;

  @ApiProperty({ required: false, default: SortOrder.ASC, enum: SortOrder })
  @IsOptional()
  @IsString()
  @IsIn([SortOrder.DESC, SortOrder.ASC])
  sortOrder: SortOrder.DESC | SortOrder.ASC;
  @ApiProperty()
  @IsOptional()
  @IsString()
  employeeType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  employee?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  //   @IsString()
  orgID?: string;
}
