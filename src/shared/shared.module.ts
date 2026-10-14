import { Module, Global } from '@nestjs/common';
import { PartitionedTableService } from './services/partitioned-table.service';
import { SequelizeModule } from '@nestjs/sequelize';
import { EventLog } from 'src/eventlog/models/eventlog.model';

@Global() // Makes this module global
@Module({
  imports: [SequelizeModule.forFeature([EventLog])],
  providers: [PartitionedTableService],
  exports: [PartitionedTableService], // Still needs to be exported for global access
})
export class SharedModule {}
