import { ListOptionInput } from 'src/shared/dtos/filter.input';

export class EventLogFilterInput extends ListOptionInput {
  search: string;

  userId: number;

  changeType: string;

  objectType: string;

  objectID: string;

  orderColumn: string;

  orderDirection: string;

  offset: number;

  limit: number;

  type: string;

  fromDate: string;

  toDate: string;
}
