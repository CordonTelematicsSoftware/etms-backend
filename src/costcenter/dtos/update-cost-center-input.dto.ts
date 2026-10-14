import { PartialType } from '@nestjs/swagger';
import { CreateCostcenterInput } from './create-costcenter-input.dto';

export class UpdateCostcenterInput extends PartialType(CreateCostcenterInput) {}
