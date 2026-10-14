import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import { NotificationTemplate } from '../models';
import { RenderedMessage } from '../interfaces/notification-provider.interface';

export interface NotificationRenderContext {
  organizationId: string;
  event: string;
  recipient: Record<string, unknown>;
  data: Record<string, unknown>;
  locale: string;
  now: string;
}

@Injectable()
export class NotificationTemplateRenderer {
  render(
    template: NotificationTemplate,
    context: NotificationRenderContext,
  ): RenderedMessage {
    const subject = template.subject
      ? Handlebars.compile(template.subject, { noEscape: false })(context)
      : undefined;
    const body = Handlebars.compile(template.body, { noEscape: false })(
      context,
    );

    return {
      subject,
      body,
    };
  }
}
