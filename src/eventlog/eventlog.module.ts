import { Global, Module } from '@nestjs/common';
import { EventLogService } from './eventlog.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { EventLogController } from './eventlog.controller';
import { Log } from './models/log.model';
import { Authentication } from 'src/auth/models/authentication.model';
import { EventLog } from './models/eventlog.model';
import { Employee } from 'src/employee/models/employee.model';
import { DynamicEvenetLogModel } from './eventlogDynamicModel';
import { VendorRequest } from 'src/vendor-management/vendor-request/models/vendor-request.model';

@Global()
@Module({
  imports: [
    SequelizeModule.forFeature([
      Log,
      Authentication,
      EventLog,
      Employee,
      VendorRequest,
    ]),
  ],
  controllers: [EventLogController],
  providers: [EventLogService, DynamicEvenetLogModel],
  exports: [EventLogService],
})
export class EventLogModule {}
