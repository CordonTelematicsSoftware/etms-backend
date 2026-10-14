import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UpsertOrganizationNotificationSettingsDto } from '../dto/channel-setting.dto';
import { UpsertOrganizationEventConfigDto } from '../dto/event-config.dto';
// import { NotificationLogQueryDto } from '../dto/log-query.dto';
import {
  CreateNotificationTemplateDto,
  TemplateQueryDto,
  UpdateNotificationTemplateDto,
} from '../dto/notification-template.dto';
// import { SendTestNotificationDto } from '../dto/send-test-notification.dto';
import { NotificationAdminService } from '../services/notification-admin.service';
import { NotificationDispatcherService } from '../services/notification-dispatcher.service';
import { getActorIdFromRequest } from '../utils/request-actor.util';
import { NotificationEvents } from '../enums/notification-events.enum';
import { UserType } from 'src/shared/enums';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';

@Controller('admin/notifications')
@ApiTags('Notification Admin')
@ApiBearerAuth('access-token')
export class NotificationTemplatesController {
  constructor(private readonly adminService: NotificationAdminService) {}

  @ApiOperation({
    summary: 'List notification event definitions configured in the module',
  })
  @ApiOkResponse({ description: 'Notification event definitions returned.' })
  @Get('events')
  listEvents() {
    return this.adminService.listEvents();
  }

  @ApiOperation({ summary: 'List predefined notification templates' })
  @ApiOkResponse({ description: 'Notification templates returned.' })
  @Get('templates')
  listTemplates(@Query() query: TemplateQueryDto) {
    return this.adminService.listTemplates(query);
  }

  @ApiOperation({ summary: 'Create a predefined notification template' })
  @ApiBody({ type: CreateNotificationTemplateDto })
  @ApiOkResponse({ description: 'Notification template created.' })
  @Post('templates')
  @UseGuards(PermissionGuard('Notification-Create'))
  createTemplate(
    @Body() body: CreateNotificationTemplateDto,
    @Req() request: unknown,
  ) {
    return this.adminService.createTemplate(
      body,
      getActorIdFromRequest(request),
    );
  }

  @ApiOperation({ summary: 'Get a notification template by id' })
  @ApiParam({ name: 'id', description: 'Notification template UUID' })
  @ApiOkResponse({ description: 'Notification template returned.' })
  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.adminService.getTemplate(id);
  }

  @ApiOperation({ summary: 'Update a notification template' })
  @ApiParam({ name: 'id', description: 'Notification template UUID' })
  @ApiBody({ type: UpdateNotificationTemplateDto })
  @ApiOkResponse({ description: 'Notification template updated.' })
  @Patch('templates/:id')
  @UseGuards(PermissionGuard('Notification-Update'))
  updateTemplate(
    @Param('id') id: string,
    @Body() body: UpdateNotificationTemplateDto,
    @Req() request: unknown,
  ) {
    return this.adminService.updateTemplate(
      id,
      body,
      getActorIdFromRequest(request),
    );
  }

  @ApiOperation({ summary: 'Deactivate a notification template' })
  @ApiParam({ name: 'id', description: 'Notification template UUID' })
  @ApiOkResponse({ description: 'Notification template deactivated.' })
  @Delete('templates/:id')
  @UseGuards(PermissionGuard('Notification-Delete'))
  deactivateTemplate(@Param('id') id: string, @Req() request: unknown) {
    return this.adminService.deactivateTemplate(
      id,
      getActorIdFromRequest(request),
    );
  }

  @ApiOperation({
    summary:
      'Get organizations currently using a template (enabled event configs)',
  })
  @ApiParam({ name: 'id', description: 'Notification template UUID' })
  @ApiOkResponse({ description: 'Template usage returned.' })
  @Get('templates/:id/usage')
  getTemplateUsage(@Param('id') id: string) {
    return this.adminService.getTemplateUsage(id);
  }

  @ApiOperation({
    summary:
      'Hard delete a notification template (only if not referenced by any organization event config)',
  })
  @ApiParam({ name: 'id', description: 'Notification template UUID' })
  @ApiOkResponse({ description: 'Notification template hard deleted.' })
  @Delete('templates/:id/hard')
  @UseGuards(PermissionGuard('Notification-Delete'))
  hardDeleteTemplate(@Param('id') id: string, @Req() request: unknown) {
    return this.adminService.hardDeleteTemplate(
      id,
      getActorIdFromRequest(request),
    );
  }

  @ApiOperation({ summary: 'To get the event list' })
  @Get('eventsList')
  getNotificationEvents() {
    return {
      events: Object.values(NotificationEvents),
    };
  }
}

@ApiTags('Organization Notifications')
@ApiBearerAuth('access-token')
@Controller('admin/organizations/:organizationId/notifications')
export class OrganizationNotificationsController {
  constructor(
    private readonly adminService: NotificationAdminService,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  // *permission*, this proves they're allowed to use it for *this org*.
  private assertOrganizationScope(user: any, organizationId: string) {
    if (user.userType === UserType.SuperAdmin) {
      return;
    }
    if (user?.orgID !== organizationId) {
      throw new ForbiddenException(
        'You are not permitted to manage notifications for this organization.',
      );
    }
  }

  @ApiOperation({
    summary: 'Get notification settings and event routes for an organization',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization identifier' })
  @ApiOkResponse({
    description: 'Organization notification settings returned.',
  })
  @Get('settings')
  getSettings(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: any,
  ) {
    this.assertOrganizationScope(user, organizationId); //
    return this.adminService.getOrganizationSettings(organizationId);
  }

  @ApiOperation({
    summary: 'Enable or disable notification channels for an organization',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization identifier' })
  @ApiBody({ type: UpsertOrganizationNotificationSettingsDto })
  @ApiOkResponse({
    description: 'Organization notification channel settings saved.',
  })
  @Put('settings')
  @UseGuards(PermissionGuard('Notification-Settings-Update'))
  upsertSettings(
    @Param('organizationId') organizationId: string,
    @Body() body: UpsertOrganizationNotificationSettingsDto,
    @Req() request: unknown,
    @CurrentUser() user: any,
  ) {
    this.assertOrganizationScope(user, organizationId); //
    return this.adminService.upsertOrganizationSettings(
      organizationId,
      body,
      getActorIdFromRequest(request),
    );
  }

  // @ApiOperation({
  //   summary: 'List event notification routes for an organization',
  // })
  // @ApiParam({ name: 'organizationId', description: 'Organization identifier' })
  // @ApiOkResponse({
  //   description: 'Organization notification event routes returned.',
  // })
  // @Get('events')
  // listEventConfigs(@Param('organizationId') organizationId: string) {
  //   return this.adminService.listOrganizationEventConfigs(organizationId);
  // }

  @ApiOperation({
    summary: 'Configure providers and templates for an organization event',
  })
  @ApiParam({ name: 'organizationId', description: 'Organization identifier' })
  @ApiParam({ name: 'event', example: 'password.reset' })
  @ApiBody({ type: UpsertOrganizationEventConfigDto })
  @ApiOkResponse({
    description: 'Organization notification event routes saved.',
  })
  @Put('events/:event')
  @UseGuards(PermissionGuard('Notification-Settings-Update'))
  upsertEventConfig(
    @Param('organizationId') organizationId: string,
    @Param('event') event: string,
    @Body() body: UpsertOrganizationEventConfigDto,
    @Req() request: unknown,
    @CurrentUser() user: any,
  ) {
    this.assertOrganizationScope(user, organizationId); //
    return this.adminService.upsertOrganizationEventConfig(
      organizationId,
      event,
      body,
      getActorIdFromRequest(request),
    );
  }

  // @ApiOperation({
  //   summary: 'Send a test notification using the organization configuration',
  // })
  // @ApiParam({ name: 'organizationId', description: 'Organization identifier' })
  // @ApiBody({ type: SendTestNotificationDto })
  // @ApiOkResponse({ description: 'Test notification dispatched.' })
  // @Post('test')
  // @UseGuards(PermissionGuard('Notification-Test'))
  // sendTestNotification(
  //   @Param('organizationId') organizationId: string,
  //   @Body() body: SendTestNotificationDto,
  //   @Req() request: unknown,
  // ) {
  //   this.adminService.logTestNotification(
  //     organizationId,
  //     body,
  //     getActorIdFromRequest(request),
  //   );
  //   return this.dispatcher.notify({
  //     organizationId,
  //     event: body.event,
  //     recipient: body.recipient,
  //     data: body.data,
  //     channels: body.channels,
  //     locale: body.locale,
  //     eventLogId: body.eventLogId,
  //     queue: body.queue,
  //   });
  // }

  // @ApiOperation({
  //   summary: 'List notification delivery logs for an organization',
  // })
  // @ApiParam({ name: 'organizationId', description: 'Organization identifier' })
  // @ApiOkResponse({ description: 'Notification logs returned.' })
  // @Get('logs')
  // listLogs(
  //   @Param('organizationId') organizationId: string,
  //   @Query() query: NotificationLogQueryDto,
  // ) {
  //   return this.adminService.listLogs(organizationId, query);
  // }
}
