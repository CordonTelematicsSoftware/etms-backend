export interface CordonPoint {
  rto_no: string;
  route_name: string;
  curlocationval: string | null;
  latitude: string | null;
  longitude: string | null;
  curdirection: string | null;
  distance: string;
  device_id: string;
  speed_class: string;
  gps_fix: string | null;
  curtimeval: string;
  fulladdress: string | null;
  ignition_status: string;
  panic: string;
  speed: string;
}

export interface CordonPullResponse {
  status: boolean;
  token_expired?: boolean;
  message?: string;
  data: CordonPoint[];
}

export interface CordonPanicRecord {
  datetime: string;
  rto: string;
  message: string;
  imei: string;
}

export interface CordonPanicResponse {
  status: boolean;
  token_expired?: boolean;
  message?: string;
  data: {
    data: CordonPanicRecord[];
  };
}

export interface CordonLoginResponse {
  status: boolean;
  token: string;
  data?: unknown;
}

export interface CordonBatchPoint {
  device_id: string;
  curlocationval: string | null;
  latitude?: string | null;
  longitude?: string | null;
  curdirection: string | null;
  speed: string;
  curtimeval: string;
  fulladdress: string | null;
  ignition_status: string;
  gps_fix: string | null;
  rto_no: string;
  panic?: string;
}

export interface CordonBatchPullResponse {
  status: boolean;
  message?: string;
  data: CordonBatchPoint[];
}

export interface GpsPoint {
  geocode: string;
  speed: string;
  createdAt: string;
  deviceId: string;
  panic: string;
  ignitionStatus: string;
  gpsFix: string | null;
  direction: string | null;
  address: string | null;
  rtoNo: string;
}
