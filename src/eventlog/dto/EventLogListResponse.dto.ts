// import { Log } from 'src/logger/models/log.model';
import { EventLog } from '../models/eventlog.model';

export class EventLogListResponse {
  eventData: EventLog[];

  eventCount: number;
}
