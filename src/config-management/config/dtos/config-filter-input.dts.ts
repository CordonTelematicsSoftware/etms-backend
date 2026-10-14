import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn, IsBoolean } from 'class-validator';
import { ListOptionInput } from 'src/shared/dtos/filter.input';
import { SortOrder } from 'src/shared/enums';

export class ConfigFilterInput extends ListOptionInput {
  @ApiProperty({
    required: false,
    default: 'id',
    enum: ['id', 'configName', 'configValue', 'defaultValue'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['id', 'configName', 'configValue', 'defaultValue'])
  sortBy: string;

  @ApiProperty({ required: false, default: SortOrder.ASC, enum: SortOrder })
  @IsOptional()
  @IsString()
  @IsIn([SortOrder.DESC, SortOrder.ASC])
  sortOrder: SortOrder.DESC | SortOrder.ASC;

  @ApiProperty({ required: false, type: Boolean })
  @IsOptional()
  @IsBoolean()
  status?: boolean;
}
