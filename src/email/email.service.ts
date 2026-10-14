import {
  Logger,
  Injectable,
  BadRequestException,
  // InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { MailObjectInput } from './dto/mail.input.dto';
import { EmailLog } from './models/email-log.model';
import { InjectModel } from '@nestjs/sequelize';
import { EmailLogInput } from './dto/email-log-input.dto';
import { EmailLogFilterInput } from './dto/email-log-filter-input.dto';
import { SortOrder } from 'src/shared/enums';
import { Op } from 'sequelize';
const ALLOWED_TEMPLATES = new Set([
  'sos-alert',
  'approval-status',
  'cab-approval-request',
  'approval-request',
  'config-update-alert',
  'driver-approval-request',
  'employee-profile-change-alert',
  'grievanceAlert',
  'grievanceStatus',
  'safe-home-success',
  'safe-home-alert',
  'scheduled-reports',
  'safe-home-confirmation',
  'shift-schedule-alert',
  'employee-noshow-suspension',
  'admin-alert-noshow-suspension',
  'account-created',
  'reset-password',
  'email-verification',
]);
@Injectable()
export class EmailService {
  private logger = new Logger(EmailService.name);

  constructor(
    @InjectModel(EmailLog)
    private emailLogModel: typeof EmailLog,
    private config: ConfigService,
    private readonly mailerService: MailerService,
  ) {}

  async sendEmail(mailObj: MailObjectInput): Promise<GenericResponse<null>> {
    try {
      const {
        cc,
        mailTo,
        subject,
        mailBody,
        attachments,
        templateName,
        isAttachments,
      } = mailObj;
      if (!ALLOWED_TEMPLATES.has(templateName)) {
        throw new BadRequestException('Unknown template');
      }
      // this.logger.log("mailTo:"mailTo);
      const response = await this.mailerService.sendMail({
        from: this.config.get('FROM_MAIL'),
        to: mailTo, // list of receivers
        cc,
        subject: subject, // Subject line
        template: templateName, //'vacancyApproval', // The `.pug`, `.ejs` or `.hbs` extension is appended automatically.
        attachments: isAttachments ? attachments : [],
        context: {
          ...mailBody,
        },
      });
      if (response) {
        this.logger.log('Mail sent');
        this.createLog({
          purpose: subject,
          toAddress: mailTo[0],
          status: true,
          error: null,
        });
        return { message: 'Success', data: null };
      }
    } catch (error) {
      this.logger.error(error.message);
      this.createLog({
        purpose: mailObj.subject,
        toAddress: mailObj.mailTo[0],
        status: false,
        error: error.message,
      });
    }
  }

  async createLog(emailLogInput: EmailLogInput): Promise<EmailLog> {
    try {
      return await this.emailLogModel.create({ ...emailLogInput });
    } catch (error) {
      this.logger.error(error);
    }
  }

  async findAll(
    emailLogFilterInput: EmailLogFilterInput,
  ): Promise<PaginatedList<EmailLog>> {
    try {
      const {
        take = 25,
        skip = 0,
        sortBy = 'id',
        sortOrder = SortOrder.DESC,
        search,
        status,
      } = emailLogFilterInput;

      let whereClause: any = {};
      if (status !== undefined) {
        whereClause.status = status;
      }
      if (search) {
        whereClause = {
          ...whereClause,
          [Op.or]: [
            {
              purpose: {
                [Op.iLike]: `%${search}%`,
              },
            },
            {
              toAddress: {
                [Op.iLike]: `%${search}%`,
              },
            },
          ],
        };
      }
      const emailLogs = await this.emailLogModel.findAndCountAll({
        distinct: true,
        order: [[`${sortBy}`, `${sortOrder}`]],
        limit: take,
        offset: skip * take,
        where: whereClause,
      });
      return {
        totalItems: emailLogs.count,
        items: emailLogs.rows,
      };
    } catch (error) {
      this.logger.error(error);
    }
  }
}
