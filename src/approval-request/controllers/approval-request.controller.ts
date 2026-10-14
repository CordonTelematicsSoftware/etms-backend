import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';

import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { ApprovalRequestService } from '../services/approval-request.service';
import { ApprovalRequestFilterInput } from '../dtos/approvalRequest-filter-input.dto';
import { ApprovalRequest } from '../models/approval-request.model';
import { UpdateApprovalInput } from '../dtos/update-approval-request-input.dto';
import { signS3UrlFields } from 'src/shared/utils/aws-s3';

@Controller('admin/approval-request')
@ApiTags('ApprovalRequest')
@ApiBearerAuth('access-token')
export class ApprovalRequestController {
  constructor(
    private readonly approvalRequestService: ApprovalRequestService,
  ) {}

  @Post('update-status')
  @UseGuards(PermissionGuard('Approval Request-Create'))
  async updateEmployeeApprovalStatus(
    @Body() input: UpdateApprovalInput,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<ApprovalRequest[]>> {
    return this.approvalRequestService.updateEmployeeApprovalStatus(
      input,
      user,
    );
  }

  @Get()
  @UseGuards(PermissionGuard('Approval Request-Read'))
  async findAll(
    @Query() approvalRequestFilterInput: ApprovalRequestFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<ApprovalRequest>> {
    const result = await this.approvalRequestService.findAll(
      approvalRequestFilterInput,
      user,
    );
    return {
      ...result,
      items: signS3UrlFields(result?.items, [
        'cab.documents[].url',
        'driver.documents[].url',
      ]),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Approval Request',
      ),
    };
  }

  @Get(':id')
  @UseGuards(PermissionGuard('Approval Request-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<ApprovalRequest>> {
    const result = await this.approvalRequestService.findOne(id, user);
    return {
      ...result,
      // approvalView renders newRecord.image as an <img> and
      // newRecord.documents[].url as a "View Document" link, straight out of
      // the JSONB blobs. A Cab/Driver row has no 'image' key and an Employee
      // row has no 'documents' key; absent paths are left untouched, so one
      // spec covers every request type. Signing is confined to this response —
      // approveCab/approveDriver/rejectCab/rejectDriver and the employee
      // branch re-read the row from the DB inside their own transaction
      // (approval-request.service.ts:165), so a signed URL can never be
      // persisted back into the document tables or Profiles.image.
      data: signS3UrlFields(result?.data, [
        'oldRecord.image',
        'newRecord.image',
        'oldRecord.documents[].url',
        'newRecord.documents[].url',
      ]),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Approval Request',
      ),
    };
  }
}
