export class GenericResponse<T> {
  message: string;
  data?: T;
  status?: boolean;
  entityPermissions?: string[];
}

export class PaginatedList<T> {
  items: T[];
  totalItems: number;
  entityPermissions?: string[];
}

export class DeletionResponse {
  status: boolean;
  message?: string;
}
