// etms-response.dto.ts
export interface ETMSTripData {
  [day: number]: string; // Format: "HH:MM P / HH:MM D" or empty string
}

export interface ETMSEmployeeData {
  id: bigint;
  name: string;
  employeeCode: string;
  email: string;
  tripData: ETMSTripData;
}

export interface ETMSResponse {
  totalItems: number;
  items: ETMSEmployeeData[];
  monthInfo: {
    year: number;
    month: number;
    daysInMonth: number;
  };
}
