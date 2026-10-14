// bulk-assign-cab-driver.dto.ts
import { IsNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AssignCabDriverDto } from './assign-cab-driver.dto'; // Reuse existing DTO

export class BulkAssignCabDriverDto {
  @ApiProperty({
    description: 'Array of trip assignments',
    type: [AssignCabDriverDto],
  })
  @IsNotEmpty({ message: 'Assignments array is required' })
  @IsArray({ message: 'Assignments must be an array' })
  @ValidateNested({ each: true })
  @Type(() => AssignCabDriverDto)
  assignments: AssignCabDriverDto[];
}
